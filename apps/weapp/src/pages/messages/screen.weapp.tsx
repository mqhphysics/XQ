import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance, useDidHide, useDidShow } from '@tarojs/taro'
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { NativeSocialPage } from '../../components/native-social/page-frame.weapp'
import { UserAvatar } from '../../components/product-ui'
import { DataState } from '../../components/public-ui'
import { openMessaging } from '../../components/messaging-drawer/index.weapp'
import { NativeDetailActiveContext } from '../../features/native-navigation/detail-context.weapp'
import { openNativeDetail } from '../../features/native-navigation/index.weapp'
import { useNativeBackLayer } from '../../features/native-navigation/leave-guard.weapp'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { formatRelativeTime } from '../../features/product/product.format'
import type { ConversationListResponse } from '../../features/product/product.types'
import { MessageBadge } from '../../features/messages/badge.weapp'
import { MessageIcon, type MessageIconName } from '../../features/messages/icons.weapp'
import { acceptInboxSummary, refreshInbox, useInbox } from '../../features/messages/inbox.weapp'
import { messageRepository } from '../../features/messages/repository.weapp'
import type { MessageCategory } from '../../features/messages/types'
import Notifications from './notifications.weapp'
import DirectMessages, { type NativeMessagesParams } from './direct.weapp'
import { MessageSettings } from './settings.weapp'
import './index.weapp.scss'

export type { NativeMessagesParams } from './direct.weapp'
export default function NativeMessagesScreen(params: NativeMessagesParams = {}) {
  const route = { ...getCurrentInstance().router?.params, ...params }
  if (route.notificationId) return <Notifications {...route} />
  if (route.conversationId || route.userId || route.new === '1')
    return <DirectMessages {...route} />
  if (route.category === 'settings' || route.category === 'blocked')
    return <MessageSettings blocked={route.category === 'blocked'} />
  if (['replies', 'mentions', 'likes', 'system'].includes(route.category || ''))
    return (
      <Notifications
        {...route}
        category={route.category === 'mentions' ? 'replies' : route.category}
      />
    )
  return <MessageHome />
}

const categories: Array<{ id: MessageCategory; title: string; icon: MessageIconName }> = [
  { id: 'replies', title: '回复与@', icon: 'reply' },
  { id: 'likes', title: '收到点赞', icon: 'like' },
  { id: 'system', title: '系统消息', icon: 'system' },
]
function MessageHome() {
  const { summary, error: summaryError } = useInbox()
  const active = useContext(NativeDetailActiveContext)
  const [visible, setVisible] = useState(true)
  useDidShow(() => setVisible(true))
  useDidHide(() => setVisible(false))
  const [items, setItems] = useState<ConversationListResponse['items']>([])
  const [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(''),
    [menu, setMenu] = useState(false),
    [marking, setMarking] = useState(false)
  const sequence = useRef(0),
    markLock = useRef(false)
  useNativeBackLayer(async () => {
    setMenu(false)
    return true
  }, menu)
  const load = useCallback(async (silent = false) => {
    const token = readSession()?.accessToken,
      ticket = ++sequence.current
    if (!token) {
      setError('请先登录后查看消息')
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)
    try {
      const [result] = await Promise.all([productRepository.getConversations(), refreshInbox()])
      if (ticket !== sequence.current || token !== readSession()?.accessToken) return
      setItems(result.items)
      setError('')
    } catch (reason) {
      if (ticket === sequence.current)
        setError(reason instanceof Error ? reason.message : '消息暂未刷新')
    } finally {
      if (ticket === sequence.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])
  useEffect(() => {
    if (!active || !visible) return
    void load()
    const timer = setInterval(() => void load(true), 15000)
    return () => {
      clearInterval(timer)
      sequence.current++
    }
  }, [active, visible, load])
  const markAll = async () => {
    if (markLock.current) return
    markLock.current = true
    setMarking(true)
    setMenu(false)
    const token = readSession()?.accessToken
    try {
      const value = await messageRepository.readAll()
      if (token !== readSession()?.accessToken) return
      acceptInboxSummary(value, token)
      setItems((previous) => previous.map((item) => ({ ...item, unreadCount: 0 })))
      void Taro.showToast({ title: '全部消息已读', icon: 'none' })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '标记失败，请重试')
    } finally {
      markLock.current = false
      setMarking(false)
    }
  }
  const navigate = (url: string) => {
    setMenu(false)
    void openNativeDetail(url)
  }
  const count = (category: MessageCategory) =>
    !summary
      ? 0
      : category === 'replies'
        ? summary.repliesUnreadCount
        : category === 'likes'
          ? summary.likesUnreadCount
          : summary.systemUnreadCount
  return (
    <NativeSocialPage
      title="消息"
      headerAction={
        <View className="native-message-menu-anchor">
          <Button
            aria-label="消息菜单"
            aria-expanded={menu}
            className="native-message-menu-toggle"
            disabled={marking}
            onClick={() => setMenu((value) => !value)}
          >
            <MessageIcon name="more" />
          </Button>
          {menu && (
            <>
              <View className="native-message-menu-dismiss" onClick={() => setMenu(false)} />
              <View className="native-message-menu" role="menu">
                <Button onClick={() => void markAll()}>
                  <MessageIcon name="brush" />
                  <Text>全部已读</Text>
                </Button>
                <Button onClick={() => navigate('/pages/messages/index?new=1')}>
                  <MessageIcon name="search" />
                  <Text>搜索人物</Text>
                </Button>
                <Button onClick={() => navigate('/pages/messages/index?category=settings')}>
                  <MessageIcon name="settings" />
                  <Text>消息设置</Text>
                </Button>
              </View>
            </>
          )}
        </View>
      }
    >
      {(error || summaryError) && (
        <View className="native-mail-error">
          <Text className="native-social-error">{error || summaryError}</Text>
          <Button className="native-button" onClick={() => void load()}>
            重试
          </Button>
        </View>
      )}
      <ScrollView
        className="native-social-scroll"
        scrollY
        showScrollbar={false}
        enhanced
        refresherEnabled
        refresherDefaultStyle="black"
        refresherTriggered={refreshing}
        onRefresherRefresh={() => {
          setRefreshing(true)
          void load(true)
        }}
      >
        <View className="native-message-categories">
          {categories.map((category) => (
            <Button
              className={`native-message-category native-message-category--${category.id}`}
              key={category.id}
              onClick={() => navigate(`/pages/messages/index?category=${category.id}`)}
            >
              <View className="native-message-category__icon">
                <MessageIcon name={category.icon} />
                <MessageBadge
                  dot={count(category.id) > 0 && summary?.preferences.badges === true}
                />
              </View>
              <Text>{category.title}</Text>
            </Button>
          ))}
        </View>
        {loading && !items.length && <DataState kind="loading" title="正在读取消息" />}
        {items.map((item) => (
          <Button
            className="native-message-conversation"
            key={item.id}
            onClick={() => void openMessaging({ conversationId: item.id })}
          >
            <View className="native-message-avatar">
              <UserAvatar
                name={item.counterpart.displayName}
                avatarUrl={item.counterpart.avatarUrl}
              />
              <MessageBadge
                dot={
                  item.unreadCount > 0 &&
                  summary?.preferences.badges === true &&
                  summary.preferences.directMessages
                }
              />
            </View>
            <View className="native-message-conversation__copy">
              <View className="native-message-conversation__head">
                <Text>{item.counterpart.displayName}</Text>
                <Text>{item.lastMessageAt ? formatRelativeTime(item.lastMessageAt) : ''}</Text>
              </View>
              <Text className="native-message-conversation__preview">
                {item.latestMessage?.body || '开始一段对话'}
              </Text>
            </View>
          </Button>
        ))}
        {!loading && !items.length && (
          <View className="native-message-empty">
            <MessageIcon name="reply" />
            <Text>还没有私信对话</Text>
            <Text>从上方“…”搜索人物，开始交流。</Text>
          </View>
        )}
      </ScrollView>
    </NativeSocialPage>
  )
}
