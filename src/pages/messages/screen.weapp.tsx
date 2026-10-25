import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance, useDidHide, useDidShow } from '@tarojs/taro'
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { NativeSocialPage } from '../../components/native-social/page-frame.weapp'
import { NativeSocialInput } from '../../components/native-social/input.weapp'
import { UserAvatar } from '../../components/product-ui'
import { PersonTrigger } from '../../components/person-trigger'
import { DataState } from '../../components/public-ui'
import {
  messageCategories,
  notificationCategory,
  type MessageCategory,
} from '../../components/messaging-drawer/message-categories.h5'
import { openMessaging, nativeMessageTarget } from '../../components/messaging-drawer/index.weapp'
import { productRepository, createClientActionId } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { formatRelativeTime } from '../../features/product/product.format'
import type {
  ConversationListResponse,
  MessageListResponse,
  MessageUser,
  NotificationResponse,
} from '../../features/product/product.types'
import { NativeDetailActiveContext } from '../../features/native-navigation/detail-context.weapp'
import {
  openNativeDetail,
  switchNativeSection,
  useNativeRouteState,
} from '../../features/native-navigation/index.weapp'
import { useNativeLeaveProtection } from '../../features/native-navigation/leave-guard.weapp'
import { nativeWriteEnabled } from '../../features/native-social/config.weapp'
import {
  clearNativeDraft,
  nativeSocialApi,
  readNativeDraft,
  saveNativeDraft,
} from '../../features/native-social/runtime.weapp'
import './index.weapp.scss'
import { ReportModal } from '../../components/report-modal'
import { NativeRefreshIndicator } from '../../features/product/native-refresh.weapp'

type Notice = NotificationResponse['items'][number]
export interface NativeMessagesParams {
  conversationId?: string | undefined
  userId?: string | undefined
  notificationId?: string | undefined
  new?: string | undefined
}
export default function NativeMessagesScreen(supplied: NativeMessagesParams = {}) {
  const params = { ...getCurrentInstance().router?.params, ...supplied }
  const routeConversation = params.conversationId || '',
    userId = params.userId || '',
    noticeId = params.notificationId || ''
  const directoryMode = params.new === '1'
  const inThread = Boolean(routeConversation || userId)
  const active = useContext(NativeDetailActiveContext)
  const [visible, setVisible] = useState(true)
  useDidHide(() => setVisible(false))
  useDidShow(() => setVisible(true))
  const [category, setCategory] = useNativeRouteState<MessageCategory>('mail-category', 'messages')
  const [conversations, setConversations] = useState<ConversationListResponse['items']>([])
  const [notifications, setNotifications] = useState<Notice[]>([])
  const [thread, setThread] = useState<MessageListResponse | null>(null)
  const [recipient, setRecipient] = useState<MessageUser | null>(() => nativeMessageTarget(userId))
  const [conversation, setConversation] = useNativeRouteState(
    'mail-conversation',
    routeConversation,
  )
  const [canSend, setCanSend] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('')
  const [sending, setSending] = useState(false),
    [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState(''),
    [people, setPeople] = useState<MessageUser[]>([]),
    [searching, setSearching] = useState(false)
  const [scrollTo, setScrollTo] = useState('')
  const [reportId, setReportId] = useState<string | null>(null)
  const scope = `message:${routeConversation || userId}`
  const [body, setBody] = useState(() =>
    inThread ? readNativeDraft(scope, { body: '', id: '', signature: '' }).body : '',
  )
  const pending = useRef(readNativeDraft(scope, { body: '', id: '', signature: '' }))
  const busy = useRef(false),
    sequence = useRef(0),
    searchSequence = useRef(0),
    nearBottom = useRef(true)
  const notice = notifications.find((item) => item.id === noticeId)
  const changeBody = (text: string) => {
    setBody(text)
    saveNativeDraft(scope, { ...pending.current, body: text })
  }
  const discard = () => {
    setBody('')
    clearNativeDraft(scope)
  }
  useNativeLeaveProtection(inThread && Boolean(body.trim()), sending, discard, true)
  const load = useCallback(
    async (silent = false) => {
      if (busy.current) return
      if (!readSession()) {
        setError('请先登录账号查看消息')
        setLoading(false)
        return
      }
      const ticket = ++sequence.current,
        owner = readSession()!.user.id
      if (!silent) setLoading(true)
      try {
        const [list, alerts, history] = await Promise.all([
          productRepository.getConversations(),
          productRepository.getNotifications(),
          conversation ? productRepository.readConversation(conversation) : Promise.resolve(null),
        ])
        if (ticket !== sequence.current || readSession()?.user.id !== owner) return
        setConversations(list.items)
        setNotifications(alerts.items)
        setCanSend(list.canSend === true)
        if (history) {
          setThread(history)
          setRecipient(history.conversation.counterpart)
        } else if (userId) {
          const existing = list.items.find((item) => item.counterpart.id === userId)
          if (existing) {
            setConversation(existing.id)
            setRecipient(existing.counterpart)
          } else if (!nativeMessageTarget(userId)) {
            const person = await productRepository.getPerson(userId)
            if (ticket === sequence.current)
              setRecipient({
                id: person.id,
                displayName: person.displayName,
                avatarUrl: person.avatarUrl,
              })
          }
        }
        if (noticeId) {
          const item = alerts.items.find((n) => n.id === noticeId)
          if (item && !item.readAt) {
            const read = await productRepository.readNotification(item.id)
            if (ticket === sequence.current) setNotifications(read.items)
          }
        }
        setError('')
      } catch (issue) {
        if (ticket === sequence.current)
          setError(issue instanceof Error ? issue.message : '消息读取失败，请重试')
      } finally {
        if (ticket === sequence.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [conversation, userId, noticeId, setConversation],
  )
  useEffect(() => {
    if (!active || !visible) return
    void load()
    const timer = setInterval(() => void load(true), inThread ? 8000 : 20000)
    return () => {
      clearInterval(timer)
      sequence.current++
    }
  }, [load, active, visible, inThread])
  useEffect(() => {
    if (!directoryMode || !active || !visible) return
    const ticket = ++searchSequence.current
    const timer = setTimeout(
      () => {
        setSearching(true)
        void productRepository
          .getMessageDirectory(query)
          .then((result) => {
            if (ticket === searchSequence.current) {
              setPeople(result.items)
              setError('')
            }
          })
          .catch((issue) => {
            if (ticket === searchSequence.current)
              setError(issue instanceof Error ? issue.message : '联系人读取失败')
          })
          .finally(() => {
            if (ticket === searchSequence.current) setSearching(false)
          })
      },
      query ? 300 : 0,
    )
    return () => {
      clearTimeout(timer)
      searchSequence.current++
    }
  }, [directoryMode, query, active, visible])
  useEffect(() => {
    if (!inThread || !nearBottom.current) return
    setScrollTo('')
    Taro.nextTick(() => setScrollTo('native-mail-bottom'))
  }, [thread?.items.length, inThread])
  const send = async () => {
    if (!recipient || !body.trim() || busy.current || !canSend) return
    busy.current = true
    sequence.current++
    setSending(true)
    setError('')
    const text = body.trim(),
      owner = readSession()?.user.id
    const signature = `${recipient.id}|${text}`
    if (pending.current.signature !== signature)
      pending.current = { body: text, signature, id: createClientActionId('native-message') }
    saveNativeDraft(scope, pending.current)
    try {
      const result = await nativeSocialApi.sendMessage(recipient.id, text, pending.current.id)
      if (readSession()?.user.id !== owner) return
      setConversation(result.conversationId)
      const next = await productRepository.readConversation(result.conversationId)
      setThread(next)
      setRecipient(next.conversation.counterpart)
      pending.current = { body: '', signature: '', id: '' }
      discard()
      nearBottom.current = true
      setScrollTo('')
      Taro.nextTick(() => setScrollTo('native-mail-bottom'))
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '发送失败，文字已保留，可重试')
    } finally {
      busy.current = false
      setSending(false)
    }
  }
  const openNotice = (item: Notice) => {
    const id = item.linkPath && /[?&]conversationId=([^&]+)/.exec(item.linkPath)?.[1]
    if (id) void openMessaging({ conversationId: decodeURIComponent(id) })
    else
      void openNativeDetail(`/pages/messages/index?notificationId=${encodeURIComponent(item.id)}`)
  }
  const related = async () => {
    const url = notice?.linkPath
    if (!url?.startsWith('/pages/')) return
    if (url.startsWith('/pages/me/')) await switchNativeSection('me')
    else if (url.startsWith('/pages/my-team/')) await switchNativeSection('team')
    else if (
      /^\/pages\/(?:post-detail|player-detail|person-detail|readonly-team-detail|readonly-match-detail)\//.test(
        url,
      )
    )
      await openNativeDetail(url)
    else await Taro.navigateTo({ url })
  }
  const title = inThread
    ? recipient?.displayName || '私信'
    : directoryMode
      ? '发私信'
      : noticeId
        ? '消息详情'
        : '消息'
  const allowSend = nativeWriteEnabled('privateMessages') && canSend && Boolean(recipient)
  const count = (id: MessageCategory) =>
    id === 'messages'
      ? conversations.reduce((sum, item) => sum + item.unreadCount, 0)
      : notifications.filter((n) => notificationCategory(n) === id && !n.readAt).length
  return (
    <NativeSocialPage
      title={title}
      action={
        !inThread && !directoryMode && !noticeId ? (
          <>
            <Text className="native-note">私信与通知</Text>
            <View className="native-mail-actions">
              <Button
                className="native-button native-button--quiet"
                onClick={() =>
                  void productRepository
                    .readAllNotifications()
                    .then((data) => setNotifications(data.items))
                    .catch((issue) => setError(issue.message))
                }
              >
                全部已读
              </Button>
              {nativeWriteEnabled('privateMessages') && canSend && (
                <Button
                  className="native-button"
                  onClick={() => void openNativeDetail('/pages/messages/index?new=1')}
                >
                  发私信
                </Button>
              )}
            </View>
          </>
        ) : undefined
      }
      footer={
        inThread && allowSend ? (
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
            重新读取
          </Button>
        </View>
      )}
      {inThread ? (
        <>
          <ScrollView
            className="native-social-scroll native-mail-history"
            scrollY
            showScrollbar={false}
            scrollIntoView={scrollTo}
            scrollWithAnimation
            enhanced
            onScroll={(event) => {
              const height = Taro.getWindowInfo().windowHeight - 240
              nearBottom.current = event.detail.scrollHeight - event.detail.scrollTop < height + 140
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
                  className={`native-mail-bubble${message.isMine ? ' is-mine' : ''}`}
                >
                  <Text className="native-mail-time">{formatRelativeTime(message.createdAt)}</Text>
                  <View>
                    <Text selectable>{message.body}</Text>
                  </View>
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
          {!allowSend && !loading && <Text className="native-mail-readonly">当前只可查看私信</Text>}
        </>
      ) : noticeId ? (
        <ScrollView className="native-social-scroll" scrollY showScrollbar={false}>
          <View className="native-mail-notice-detail">
            {notice ? (
              <>
                <UserAvatar
                  name={notice.actor?.displayName || '晓球'}
                  avatarUrl={notice.actor?.avatarUrl || null}
                />
                <Text className="native-mail-notice-title">{notice.title}</Text>
                <Text className="native-note">{formatRelativeTime(notice.createdAt)}</Text>
                <Text selectable>{notice.body || notice.title}</Text>
                {notice.linkPath && (
                  <Button className="native-button" onClick={() => void related()}>
                    查看相关内容
                  </Button>
                )}
              </>
            ) : loading ? (
              <Text>正在读取通知…</Text>
            ) : (
              <Text>这条通知暂不可用</Text>
            )}
          </View>
        </ScrollView>
      ) : directoryMode ? (
        <View className="native-mail-directory">
          <Input
            className="native-field"
            value={query}
            placeholder="搜索昵称或姓名"
            onInput={(event) => setQuery(event.detail.value)}
          />
          {searching && <Text className="native-note">正在查找联系人…</Text>}
          <ScrollView className="native-social-scroll" scrollY showScrollbar={false}>
            {people.map((person) => (
              <Button
                className="native-mail-contact"
                key={person.id}
                onClick={() => void openMessaging(person)}
              >
                <UserAvatar name={person.displayName} avatarUrl={person.avatarUrl} />
                <Text>{person.displayName}</Text>
                <Text>›</Text>
              </Button>
            ))}
            {!searching && !people.length && (
              <Text className="native-mail-empty">没有找到可私信的同学</Text>
            )}
          </ScrollView>
        </View>
      ) : (
        <View className="native-mail-main">
          <View
            className="native-mail-categories"
            role="tablist"
            onTouchStart={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
            onTouchEnd={(event) => event.stopPropagation()}
          >
            {messageCategories.map((item) => (
              <Button
                key={item.id}
                aria-selected={category === item.id}
                className={`native-mail-category${category === item.id ? ' is-active' : ''}`}
                onClick={() => setCategory(item.id)}
              >
                <Text>{item.label}</Text>
                {count(item.id) > 0 && <Text className="native-mail-badge">{count(item.id)}</Text>}
              </Button>
            ))}
          </View>
          <ScrollView
            className="native-social-scroll"
            scrollY
            showScrollbar={false}
            enhanced
            refresherEnabled
            refresherDefaultStyle="none"
            refresherThreshold={64}
            refresherTriggered={refreshing}
            onRefresherRefresh={() => {
              setRefreshing(true)
              void load(true)
            }}
          >
            <NativeRefreshIndicator spinning={refreshing} />
            {loading && !conversations.length && !notifications.length && (
              <DataState kind="loading" title="正在读取消息" />
            )}
            {category === 'messages'
              ? conversations.map((item) => (
                  <Button
                    key={item.id}
                    className="native-mail-contact"
                    onClick={() => void openMessaging({ conversationId: item.id })}
                  >
                    <UserAvatar
                      name={item.counterpart.displayName}
                      avatarUrl={item.counterpart.avatarUrl}
                    />
                    <View>
                      <View>
                        <Text>{item.counterpart.displayName}</Text>
                        <Text>
                          {item.lastMessageAt ? formatRelativeTime(item.lastMessageAt) : ''}
                        </Text>
                      </View>
                      <Text>{item.latestMessage?.body || '暂无私信'}</Text>
                    </View>
                    {item.unreadCount > 0 && (
                      <Text className="native-mail-badge">{item.unreadCount}</Text>
                    )}
                  </Button>
                ))
              : notifications
                  .filter((item) => notificationCategory(item) === category)
                  .map((item) => (
                    <Button
                      key={item.id}
                      className="native-mail-contact"
                      onClick={() => openNotice(item)}
                    >
                      <UserAvatar
                        name={item.actor?.displayName || '晓球'}
                        avatarUrl={item.actor?.avatarUrl || null}
                      />
                      <View>
                        <View>
                          <Text>{item.actor?.displayName || '晓球通知'}</Text>
                          <Text>{formatRelativeTime(item.createdAt)}</Text>
                        </View>
                        <Text>{item.title}</Text>
                      </View>
                      {!item.readAt && <Text className="native-mail-badge">●</Text>}
                    </Button>
                  ))}
            {!loading &&
              !(category === 'messages'
                ? conversations.length
                : notifications.filter((item) => notificationCategory(item) === category)
                    .length) && (
                <Text className="native-mail-empty">
                  暂时没有{messageCategories.find((item) => item.id === category)?.label}
                </Text>
              )}
          </ScrollView>
        </View>
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
