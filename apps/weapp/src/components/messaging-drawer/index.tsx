import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'

import { UserAvatar } from '../product-ui'
import { createClientActionId, productRepository } from '../../features/product/product.repository'
import type {
  ConversationListResponse,
  MessageListResponse,
  MessageUser,
} from '../../features/product/product.types'
import { useOverlayFocus } from '../overlay-focus'
import { ReportModal } from '../report-modal'
import { IconButton } from '../icon-button'

import './index.scss'

type OpenRequest = MessageUser | { conversationId: string } | undefined
const listeners = new Set<(user: OpenRequest) => void>()

export function openMessaging(request?: MessageUser | { conversationId: string }) {
  for (const listener of listeners) listener(request)
}

export function MessagingDrawer() {
  const [open, setOpen] = useState(false)
  const [directory, setDirectory] = useState<MessageUser[]>([])
  const [conversations, setConversations] = useState<ConversationListResponse['items']>([])
  const [selected, setSelected] = useState<MessageUser | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageListResponse['items']>([])
  const [body, setBody] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [reportTarget, setReportTarget] = useState<{ id: string; body: string } | null>(null)
  const selectionRequestRef = useRef(0)
  const directoryRequestRef = useRef(0)
  const selectedIdRef = useRef<string | null>(null)
  const queryRef = useRef('')
  const openRequestRef = useRef(0)
  const [pendingMessage, setPendingMessage] = useState<{
    body: string
    clientMessageId: string
    recipientUserId: string
  } | null>(null)
  const closeDrawer = useCallback(() => {
    openRequestRef.current += 1
    selectionRequestRef.current += 1
    setOpen(false)
  }, [])
  useOverlayFocus(open && !reportTarget, '.message-drawer', closeDrawer)

  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null
  }, [selected])

  useEffect(() => {
    queryRef.current = query
  }, [query])

  const loadLists = useCallback(async () => {
    const [people, list] = await Promise.all([
      productRepository.getMessageDirectory(),
      productRepository.getConversations(),
    ])
    if (!queryRef.current.trim()) setDirectory(people.items)
    setConversations(list.items)
    return list.items
  }, [])

  const selectConversation = useCallback(async (id: string, user: MessageUser, silent = false) => {
    if (silent && selectedIdRef.current !== user.id) return
    const requestId = ++selectionRequestRef.current
    if (!silent) {
      if (selectedIdRef.current !== user.id) {
        setBody('')
        setPendingMessage(null)
      }
      selectedIdRef.current = user.id
      setSelected(user)
      setConversationId(id)
      setMessages([])
      setLoading(true)
    }
    try {
      const data = await productRepository.readConversation(id)
      if (selectionRequestRef.current !== requestId) return
      setMessages(data.items)
    } catch (error) {
      if (selectionRequestRef.current !== requestId || silent) return
      await Taro.showToast({
        title: error instanceof Error ? error.message : '会话加载失败',
        icon: 'none',
      })
    } finally {
      if (!silent && selectionRequestRef.current === requestId) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const listener = (user: OpenRequest) => {
      const openRequestId = ++openRequestRef.current
      setOpen(true)
      setQuery('')
      setLoading(true)
      if (user) {
        selectionRequestRef.current += 1
        selectedIdRef.current = null
        setSelected(null)
        setConversationId(null)
        setMessages([])
        setBody('')
        setPendingMessage(null)
      }
      void loadLists()
        .then(async (items) => {
          if (openRequestRef.current !== openRequestId) return
          if (!user) return
          const existing = items.find((item) =>
            'conversationId' in user
              ? item.id === user.conversationId
              : item.counterpart.id === user.id,
          )
          if (existing) return selectConversation(existing.id, existing.counterpart)
          if ('conversationId' in user) {
            const requestId = ++selectionRequestRef.current
            const data = await productRepository.readConversation(user.conversationId)
            if (
              openRequestRef.current !== openRequestId ||
              selectionRequestRef.current !== requestId
            )
              return
            selectedIdRef.current = data.conversation.counterpart.id
            setSelected(data.conversation.counterpart)
            setConversationId(data.conversation.id)
            setMessages(data.items)
            return
          }
          selectedIdRef.current = user.id
          setSelected(user)
          setConversationId(null)
          setMessages([])
        })
        .catch((error) => {
          if (openRequestRef.current !== openRequestId) return undefined
          return Taro.showToast({
            title: error instanceof Error ? error.message : '私信加载失败',
            icon: 'none',
          })
        })
        .finally(() => {
          if (openRequestRef.current === openRequestId) setLoading(false)
        })
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [loadLists, selectConversation])

  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => {
      void productRepository
        .getConversations()
        .then((data) => setConversations(data.items))
        .catch(() => undefined)
      if (conversationId && selected) void selectConversation(conversationId, selected, true)
    }, 5000)
    return () => clearInterval(timer)
  }, [conversationId, loadLists, open, selectConversation, selected])

  useEffect(() => {
    if (!open) return
    const requestId = ++directoryRequestRef.current
    const timer = setTimeout(() => {
      void productRepository
        .getMessageDirectory(query)
        .then((data) => {
          if (directoryRequestRef.current === requestId) setDirectory(data.items)
        })
        .catch(async (error) => {
          if (directoryRequestRef.current !== requestId) return
          await Taro.showToast({
            title: error instanceof Error ? error.message : '用户搜索失败',
            icon: 'none',
          })
        })
    }, 220)
    return () => clearTimeout(timer)
  }, [open, query])

  const send = async () => {
    if (!selected || !body.trim() || sending) return
    const text = body.trim()
    const request =
      pendingMessage?.recipientUserId === selected.id && pendingMessage.body === text
        ? pendingMessage
        : {
            body: text,
            clientMessageId: createClientActionId('message'),
            recipientUserId: selected.id,
          }
    setPendingMessage(request)
    setSending(true)
    setBody('')
    try {
      const result = await productRepository.sendMessage(
        request.recipientUserId,
        text,
        request.clientMessageId,
      )
      setPendingMessage(null)
      try {
        if (selectedIdRef.current === request.recipientUserId) {
          setConversationId(result.conversationId)
          await selectConversation(result.conversationId, selected, true)
        }
        await loadLists()
      } catch {
        await Taro.showToast({ title: '消息已发送，列表刷新稍后重试', icon: 'none' })
      }
    } catch (error) {
      if (selectedIdRef.current === request.recipientUserId) setBody(text)
      await Taro.showToast({
        title: error instanceof Error ? error.message : '发送失败',
        icon: 'none',
      })
    } finally {
      setSending(false)
    }
  }

  if (!open) return null
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  const filtered = normalized
    ? directory.filter((user) => user.displayName.toLocaleLowerCase('zh-CN').includes(normalized))
    : directory
  const visibleUsers = normalized
    ? filtered
    : conversations.length > 0
      ? conversations.map((item) => item.counterpart)
      : directory
  return (
    <View className="message-layer">
      <View className="message-scrim" onClick={closeDrawer} />
      <View aria-modal role="dialog" aria-label="私信" className="message-drawer">
        <View className="message-drawer__head">
          <View>
            <Text className="message-drawer__kicker">MESSAGES</Text>
            <Text className="message-drawer__title">私信</Text>
          </View>
          <IconButton icon="close" aria-label="关闭私信" className="message-drawer__close" onClick={closeDrawer}>
            ×
          </IconButton>
        </View>
        <View className="message-drawer__body">
          <View className="message-sidebar">
            <Input
              className="message-search"
              placeholder="搜索校内用户"
              value={query}
              onInput={(event) => setQuery(event.detail.value)}
            />
            <ScrollView className="message-list" scrollY>
              {visibleUsers.map((user) => {
                const conversation = conversations.find((item) => item.counterpart.id === user.id)
                return (
                  <Button
                    disabled={sending}
                    className={`message-contact ${selected?.id === user.id ? 'message-contact--active' : ''}`}
                    key={user.id}
                    onClick={() => {
                      if (conversation) {
                        void selectConversation(conversation.id, conversation.counterpart)
                        return
                      }
                      selectionRequestRef.current += 1
                      selectedIdRef.current = user.id
                      setBody('')
                      setPendingMessage(null)
                      setSelected(user)
                      setConversationId(null)
                      setMessages([])
                    }}
                  >
                    <UserAvatar avatarUrl={user.avatarUrl} name={user.displayName} size="small" />
                    <View>
                      <Text>{user.displayName}</Text>
                      <Text>{conversation?.latestMessage?.body ?? '开始新对话'}</Text>
                    </View>
                    {(conversation?.unreadCount ?? 0) > 0 && (
                      <Text className="message-contact__badge">{conversation!.unreadCount}</Text>
                    )}
                  </Button>
                )
              })}
              {!loading && visibleUsers.length === 0 && (
                <Text className="message-empty">暂无可私信用户</Text>
              )}
            </ScrollView>
          </View>
          <View className="message-thread">
            {selected ? (
              <>
                <View className="message-thread__person">
                  <UserAvatar
                    avatarUrl={selected.avatarUrl}
                    name={selected.displayName}
                    size="small"
                  />
                  <Text>{selected.displayName}</Text>
                </View>
                <ScrollView
                  className="message-bubbles"
                  scrollY
                  {...(messages.at(-1) ? { scrollIntoView: messages.at(-1)!.id } : {})}
                >
                  {messages.map((message) => (
                    <View
                      id={message.id}
                      className={`message-bubble ${message.isMine ? 'message-bubble--mine' : ''}`}
                      key={message.id}
                    >
                      <Text>{message.body}</Text>
                      {!message.isMine && (
                        <Button
                          className="message-bubble__report"
                          onClick={() => setReportTarget({ id: message.id, body: message.body })}
                        >
                          投诉
                        </Button>
                      )}
                    </View>
                  ))}
                  {messages.length === 0 && (
                    <Text className="message-empty">说声你好，开始一段校内对话。</Text>
                  )}
                </ScrollView>
                <View className="message-compose">
                  <Input
                    disabled={sending}
                    confirmType="send"
                    maxlength={2000}
                    placeholder="输入私信"
                    value={body}
                    onConfirm={() => void send()}
                    onInput={(event) => setBody(event.detail.value)}
                  />
                  <Button
                    disabled={!body.trim() || sending}
                    loading={sending}
                    onClick={() => void send()}
                  >
                    发送
                  </Button>
                </View>
              </>
            ) : (
              <Text className="message-empty message-empty--center">选择一个人开始私聊</Text>
            )}
          </View>
        </View>
      </View>
      {reportTarget && (
        <ReportModal
          targetId={reportTarget.id}
          targetType="DIRECT_MESSAGE"
          title={`投诉私信：${reportTarget.body.slice(0, 18)}`}
          onClose={() => setReportTarget(null)}
        />
      )}
    </View>
  )
}
