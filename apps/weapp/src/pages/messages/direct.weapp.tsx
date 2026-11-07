import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance, useDidHide, useDidShow } from '@tarojs/taro'
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { NativeSocialPage } from '../../components/native-social/page-frame.weapp'
import { NativeSocialInput } from '../../components/native-social/input.weapp'
import { UserAvatar } from '../../components/product-ui'
import { PersonTrigger } from '../../components/person-trigger'
import { ReportModal } from '../../components/report-modal/index.weapp'
import { openMessaging, nativeMessageTarget } from '../../components/messaging-drawer/index.weapp'
import { productRepository, createClientActionId } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { formatDate, formatRelativeTime } from '../../features/product/product.format'
import type { MessageUser } from '../../features/product/product.types'
import { NativeDetailActiveContext } from '../../features/native-navigation/detail-context.weapp'
import { useNativeRouteState } from '../../features/native-navigation/index.weapp'
import { useNativeLeaveProtection } from '../../features/native-navigation/leave-guard.weapp'
import { nativeWriteEnabled } from '../../features/native-social/config.weapp'
import {
  clearNativeDraft,
  nativeSocialApi,
  readNativeDraft,
  saveNativeDraft,
} from '../../features/native-social/runtime.weapp'
import { messageRepository } from '../../features/messages/repository.weapp'
import { refreshInbox, useInbox } from '../../features/messages/inbox.weapp'
import { MessageIcon } from '../../features/messages/icons.weapp'
import { openMessageTarget } from '../../features/messages/navigation.weapp'
import type { MessageThread } from '../../features/messages/types'
import './index.weapp.scss'

export interface NativeMessagesParams {
  conversationId?: string | undefined
  userId?: string | undefined
  notificationId?: string | undefined
  private?: string | undefined
  category?: string | undefined
  new?: string | undefined
}
export default function DirectMessages(supplied: NativeMessagesParams = {}) {
  const params = { ...getCurrentInstance().router?.params, ...supplied }
  return params.new === '1' ? (
    <MessageDirectory />
  ) : (
    <MessageConversation
      conversationId={params.conversationId || ''}
      userId={params.userId || ''}
    />
  )
}
function MessageDirectory() {
  const active = useContext(NativeDetailActiveContext)
  const [query, setQuery] = useState(''),
    [people, setPeople] = useState<MessageUser[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('')
  const sequence = useRef(0)
  useEffect(() => {
    if (!active) return
    const ticket = ++sequence.current,
      token = readSession()?.accessToken
    const timer = setTimeout(
      () => {
        setLoading(true)
        void productRepository
          .getMessageDirectory(query)
          .then((result) => {
            if (ticket === sequence.current && token === readSession()?.accessToken) {
              setPeople(result.items)
              setError('')
            }
          })
          .catch((reason) => {
            if (ticket === sequence.current)
              setError(reason instanceof Error ? reason.message : '搜索失败，请重试')
          })
          .finally(() => {
            if (ticket === sequence.current) setLoading(false)
          })
      },
      query ? 300 : 0,
    )
    return () => {
      clearTimeout(timer)
      sequence.current++
    }
  }, [active, query])
  return (
    <NativeSocialPage title="搜索人物" centerTitle>
      <View className="native-mail-directory">
        <View className="native-message-search">
          <MessageIcon name="search" />
          <Input
            value={query}
            placeholder="搜索昵称或姓名"
            maxlength={80}
            onInput={(event) => setQuery(event.detail.value)}
          />
        </View>
        {error && <Text className="native-social-error">{error}</Text>}
        <ScrollView className="native-social-scroll" scrollY showScrollbar={false}>
          {people.map((person) => (
            <Button
              className="native-message-conversation"
              key={person.id}
              onClick={() => void openMessaging(person)}
            >
              <View className="native-message-avatar">
                <UserAvatar name={person.displayName} avatarUrl={person.avatarUrl} />
              </View>
              <View className="native-message-conversation__copy">
                <Text className="native-message-person-name">{person.displayName}</Text>
              </View>
              <Text className="native-message-chevron">›</Text>
            </Button>
          ))}
          {loading && <Text className="native-mail-empty">正在搜索…</Text>}
          {!loading && !people.length && (
            <Text className="native-mail-empty">没有找到可私信的用户</Text>
          )}
        </ScrollView>
      </View>
    </NativeSocialPage>
  )
}
function MessageConversation({
  conversationId,
  userId,
}: {
  conversationId: string
  userId: string
}) {
  useInbox()
  const active = useContext(NativeDetailActiveContext)
  const [visible, setVisible] = useState(true)
  useDidShow(() => setVisible(true))
  useDidHide(() => setVisible(false))
  const [conversation, setConversation] = useNativeRouteState('mail-conversation', conversationId)
  const [thread, setThread] = useState<MessageThread | null>(null)
  const [recipient, setRecipient] = useState<MessageUser | null>(() => nativeMessageTarget(userId))
  const [canSend, setCanSend] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [sending, setSending] = useState(false)
  const [scrollTo, setScrollTo] = useState(''),
    [reportId, setReportId] = useState<string | null>(null)
  const scope = `message:${conversationId || userId}`
  const pending = useRef(readNativeDraft(scope, { body: '', id: '', signature: '' }))
  const [body, setBody] = useState(pending.current.body)
  const busy = useRef(false),
    sequence = useRef(0),
    nearBottom = useRef(true)
  const changeBody = (text: string) => {
    setBody(text)
    saveNativeDraft(scope, { ...pending.current, body: text })
  }
  const discard = () => {
    setBody('')
    clearNativeDraft(scope)
  }
  useNativeLeaveProtection(Boolean(body.trim()), sending, discard, true)
  const load = useCallback(
    async (silent = false) => {
      if (busy.current) return
      const token = readSession()?.accessToken,
        ticket = ++sequence.current
      if (!token) {
        setLoading(false)
        setError('请先登录后查看私信')
        return
      }
      if (!silent) setLoading(true)
      try {
        if (conversation) {
          const result = await messageRepository.readConversation(conversation)
          if (ticket !== sequence.current || token !== readSession()?.accessToken) return
          setThread(result)
          setRecipient(result.conversation.counterpart)
          setCanSend(result.conversation.canSend !== false && !result.conversation.blocked)
          void refreshInbox(true)
        } else {
          const list = await productRepository.getConversations()
          if (ticket !== sequence.current || token !== readSession()?.accessToken) return
          setCanSend(list.canSend === true)
          const existing = list.items.find((item) => item.counterpart.id === userId)
          if (existing) {
            setConversation(existing.id)
            setRecipient(existing.counterpart)
          } else if (!nativeMessageTarget(userId)) {
            const person = await productRepository.getPerson(userId)
            if (ticket !== sequence.current || token !== readSession()?.accessToken) return
            setRecipient({
              id: person.id,
              displayName: person.displayName,
              avatarUrl: person.avatarUrl,
            })
          }
        }
        setError('')
      } catch (reason) {
        if (ticket === sequence.current)
          setError(reason instanceof Error ? reason.message : '私信读取失败')
      } finally {
        if (ticket === sequence.current) setLoading(false)
      }
    },
    [conversation, userId, setConversation],
  )
  useEffect(() => {
    if (!active || !visible) return
    void load()
    const timer = setInterval(() => void load(true), 8000)
    const changed = () => void load(true)
    Taro.eventCenter.on('xiaoqiu:native-blocks-changed', changed)
    return () => {
      clearInterval(timer)
      sequence.current++
      Taro.eventCenter.off('xiaoqiu:native-blocks-changed', changed)
    }
  }, [active, visible, load])
  useEffect(() => {
    if (!nearBottom.current) return
    setScrollTo('')
    Taro.nextTick(() => setScrollTo('native-mail-bottom'))
  }, [thread?.items.length])
  const send = async () => {
    if (!recipient || !body.trim() || busy.current || !canSend) return
    busy.current = true
    sequence.current++
    setSending(true)
    setError('')
    const text = body.trim(),
      token = readSession()?.accessToken
    const signature = `${recipient.id}|${text}`
    if (pending.current.signature !== signature)
      pending.current = { body: text, signature, id: createClientActionId('native-message') }
    saveNativeDraft(scope, pending.current)
    try {
      const result = await nativeSocialApi.sendMessage(recipient.id, text, pending.current.id)
      if (token !== readSession()?.accessToken) return
      setConversation(result.conversationId)
      const history = await messageRepository.readConversation(result.conversationId)
      if (token !== readSession()?.accessToken) return
      setThread(history)
      setRecipient(history.conversation.counterpart)
      setCanSend(history.conversation.canSend !== false && !history.conversation.blocked)
      pending.current = { body: '', signature: '', id: '' }
      discard()
      nearBottom.current = true
      setScrollTo('')
      Taro.nextTick(() => setScrollTo('native-mail-bottom'))
      void refreshInbox(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '发送失败，文字已保留，可重试')
    } finally {
      busy.current = false
      setSending(false)
    }
  }
  const allowSend = nativeWriteEnabled('privateMessages') && canSend && Boolean(recipient)
  return (
    <NativeSocialPage
      title={recipient?.displayName || '私信'}
      centerTitle
      footer={
        allowSend ? (
          <NativeSocialInput
            maximum={2000}
            adjustPosition={false}
            value={body}
            onChange={changeBody}
            onSend={() => void send()}
            busy={sending}
            placeholder="写私信…"
          />
        ) : undefined
      }
    >
      {error && (
        <View className="native-mail-error">
          <Text className="native-social-error">{error}</Text>
          <Button className="native-button" onClick={() => void load()}>
            重试
          </Button>
        </View>
      )}
      <ScrollView
        className="native-social-scroll native-mail-history"
        scrollY
        showScrollbar={false}
        scrollIntoView={scrollTo}
        scrollWithAnimation
        enhanced
        onScroll={(event) => {
          nearBottom.current =
            event.detail.scrollHeight - event.detail.scrollTop <
            Taro.getWindowInfo().windowHeight - 100
        }}
      >
        <View className="native-social-padding">
          {loading && !thread && <Text className="native-note">正在读取私信…</Text>}
          {recipient && (
            <PersonTrigger userId={recipient.id} name={recipient.displayName}>
              <View className="native-mail-person">
                <UserAvatar
                  name={recipient.displayName}
                  avatarUrl={recipient.avatarUrl}
                  size="small"
                />
                <Text>查看个人档案 ›</Text>
              </View>
            </PersonTrigger>
          )}
          {thread?.items.map((message) => (
            <View
              key={message.id}
              className={`native-mail-bubble${message.isMine ? ' is-mine' : ''}${message.kind === 'ADMIN_NOTICE' ? ' native-mail-bubble--official' : ''}`}
            >
              <Text className="native-mail-time">{formatRelativeTime(message.createdAt)}</Text>
              {message.kind === 'ADMIN_NOTICE' && message.notice ? (
                <View className="native-message-official-card">
                  <View className="native-message-official-card__label">
                    <MessageIcon name="shield" />
                    <Text>管理员通知</Text>
                  </View>
                  <Text className="native-message-official-card__title">
                    {message.notice.title}
                  </Text>
                  <Text selectable>{message.body}</Text>
                  <Text className="native-message-official-card__deadline">
                    请在 {formatDate(message.notice.deadlineAt)} 前核对并提交更正申请
                  </Text>
                  {!message.isMine && (
                    <Button
                      className="native-message-official-card__action"
                      onClick={() => void openMessageTarget(message.notice?.actionPath)}
                    >
                      前往更正姓名或学号 ›
                    </Button>
                  )}
                </View>
              ) : (
                <View>
                  <Text selectable>{message.body}</Text>
                </View>
              )}
              {message.isMine && (
                <Text className="native-mail-read">{message.readAt ? '已读' : '已发送'}</Text>
              )}
              {!message.isMine && (
                <Button className="native-mail-report" onClick={() => setReportId(message.id)}>
                  举报
                </Button>
              )}
            </View>
          ))}
          {!loading && !thread?.items.length && (
            <Text className="native-mail-empty">还没有私信，打个招呼吧</Text>
          )}
          <View id="native-mail-bottom" />
        </View>
      </ScrollView>
      {!allowSend && !loading && (
        <Text className="native-mail-readonly">当前无法向此用户发送私信</Text>
      )}
      {reportId && (
        <ReportModal
          targetType="DIRECT_MESSAGE"
          targetId={reportId}
          title="举报私信"
          onClose={() => setReportId(null)}
        />
      )}
    </NativeSocialPage>
  )
}
