import { Button, Image, ScrollView, Text, View } from '@tarojs/components'
import { getCurrentInstance, useDidHide, useDidShow } from '@tarojs/taro'
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { NativeSocialPage } from '../../components/native-social/page-frame.weapp'
import { UserAvatar } from '../../components/product-ui'
import { DataState } from '../../components/public-ui'
import { NativeDetailActiveContext } from '../../features/native-navigation/detail-context.weapp'
import { openNativeDetail } from '../../features/native-navigation/index.weapp'
import { productRepository, resolveMediaUrl } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { formatRelativeTime } from '../../features/product/product.format'
import type { NotificationResponse } from '../../features/product/product.types'
import { messageRepository } from '../../features/messages/repository.weapp'
import { acceptInboxSummary, refreshInbox, useInbox } from '../../features/messages/inbox.weapp'
import { MessageBadge } from '../../features/messages/badge.weapp'
import { MessageIcon } from '../../features/messages/icons.weapp'
import { messageActorLabel } from '../../features/messages/badge.logic'
import { openMessageTarget } from '../../features/messages/navigation.weapp'
import type { MessageCategory, MessageNotification } from '../../features/messages/types'
import type { NativeMessagesParams } from './direct.weapp'
import './index.weapp.scss'

const labels = { replies: '回复与@', likes: '收到点赞', system: '系统消息' }
export default function Notifications(supplied: NativeMessagesParams = {}) {
  const params = { ...getCurrentInstance().router?.params, ...supplied }
  if (params.notificationId) return <NotificationDetail id={params.notificationId} />
  const category: MessageCategory =
    params.category === 'likes' ? 'likes' : params.category === 'system' ? 'system' : 'replies'
  return <NotificationCategory key={category} category={category} />
}
function NotificationCategory({ category }: { category: MessageCategory }) {
  const active = useContext(NativeDetailActiveContext),
    { summary } = useInbox()
  const [visible, setVisible] = useState(true)
  useDidShow(() => setVisible(true))
  useDidHide(() => setVisible(false))
  const [items, setItems] = useState<MessageNotification[]>([]),
    [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [more, setMore] = useState(false),
    [error, setError] = useState('')
  const sequence = useRef(0),
    moreLock = useRef(false),
    opening = useRef(false),
    initialized = useRef(false),
    paginated = useRef(false)
  const load = useCallback(
    async (silent = false, reset = false) => {
      if (initialized.current && !reset && (!silent || paginated.current || moreLock.current)) {
        void refreshInbox()
        return
      }
      const token = readSession()?.accessToken,
        ticket = ++sequence.current
      if (!token) {
        setLoading(false)
        setError('请先登录后查看消息')
        return
      }
      if (!silent) setLoading(true)
      try {
        const data = await messageRepository.notifications(category)
        if (ticket !== sequence.current || token !== readSession()?.accessToken) return
        setItems(data.items)
        setCursor(data.nextCursor)
        initialized.current = true
        paginated.current = false
        setError('')
      } catch (reason) {
        if (ticket === sequence.current)
          setError(reason instanceof Error ? reason.message : '通知暂未刷新')
      } finally {
        if (ticket === sequence.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [category],
  )
  useEffect(() => {
    if (!active || !visible) return
    void load()
    const timer = setInterval(() => void load(true), 15000)
    return () => {
      sequence.current++
      clearInterval(timer)
    }
  }, [active, visible, load])
  const loadMore = async () => {
    if (!cursor || moreLock.current) return
    moreLock.current = true
    setMore(true)
    const token = readSession()?.accessToken,
      ticket = sequence.current
    try {
      const data = await messageRepository.notifications(category, cursor)
      if (ticket !== sequence.current || token !== readSession()?.accessToken) return
      setItems((previous) => [
        ...previous,
        ...data.items.filter((item) => !previous.some((old) => old.id === item.id)),
      ])
      setCursor(data.nextCursor)
      paginated.current = true
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '更早消息读取失败')
    } finally {
      moreLock.current = false
      setMore(false)
    }
  }
  const open = async (item: MessageNotification) => {
    if (opening.current) return
    opening.current = true
    const token = readSession()?.accessToken
    try {
      if (item.unreadCount > 0 || !item.readAt) {
        const result = await messageRepository.readGroup(item.id)
        if (token !== readSession()?.accessToken) return
        acceptInboxSummary(result, token)
        setItems((previous) =>
          previous.map((row) =>
            row.id === item.id ? { ...row, readAt: new Date().toISOString(), unreadCount: 0 } : row,
          ),
        )
      }
      if (category === 'system' || (!item.target && !item.linkPath))
        await openNativeDetail(
          '/pages/messages/index?notificationId=' + encodeURIComponent(item.id),
        )
      else
        await openMessageTarget(
          item.linkPath ||
            (item.target
              ? '/pages/post-detail/index?postId=' + encodeURIComponent(item.target.postId)
              : null),
        )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '消息打开失败，请重试')
    } finally {
      opening.current = false
    }
  }
  return (
    <NativeSocialPage title={labels[category]} centerTitle>
      {error && (
        <View className="native-mail-error">
          <Text className="native-social-error">{error}</Text>
          <Button className="native-button" onClick={() => void load(false, true)}>
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
          void load(true, true)
        }}
      >
        {loading && !items.length && <DataState kind="loading" title="正在读取通知" />}
        {items.map((item) => (
          <Button key={item.id} className="native-message-notice" onClick={() => void open(item)}>
            <View
              className={
                'native-message-actors' +
                (item.actors.length > 1 ? ' native-message-actors--stacked' : '')
              }
            >
              {item.actors.length ? (
                item.actors.slice(0, 2).map((actor) => (
                  <View key={actor.id}>
                    <UserAvatar name={actor.displayName} avatarUrl={actor.avatarUrl} />
                  </View>
                ))
              ) : (
                <View className="native-message-system-avatar">
                  <MessageIcon name="system" />
                </View>
              )}
              <MessageBadge dot={item.unreadCount > 0 && summary?.preferences.badges === true} />
            </View>
            <View className="native-message-notice__copy">
              {category === 'likes' ? (
                <Text className="native-message-notice__body">
                  <Text className="native-message-notice__names">
                    {messageActorLabel(item.actors, item.actorCount)}
                  </Text>
                  {item.target?.kind === 'COMMENT' ? '赞了我的评论' : '赞了我的动态'}
                </Text>
              ) : (
                <>
                  <Text className="native-message-notice__names">
                    {item.actors[0]?.displayName || '晓球通知'}
                  </Text>
                  <Text className="native-message-notice__body">{item.title}</Text>
                </>
              )}
              <Text className="native-message-notice__time">
                {formatRelativeTime(item.createdAt)}
              </Text>
            </View>
            {item.target && (
              <View className="native-message-notice__target">
                {item.target.imageUrl ? (
                  <Image
                    src={resolveMediaUrl(item.target.imageUrl) || item.target.imageUrl}
                    mode="aspectFill"
                  />
                ) : (
                  <Text>
                    {item.target.excerpt ||
                      (item.target.kind === 'COMMENT' ? '查看评论' : '查看动态')}
                  </Text>
                )}
              </View>
            )}
          </Button>
        ))}
        {!loading && !items.length && (
          <View className="native-message-empty">
            <MessageIcon
              name={category === 'likes' ? 'like' : category === 'system' ? 'system' : 'reply'}
            />
            <Text>暂时没有{labels[category]}</Text>
          </View>
        )}
        {cursor && (
          <Button
            className="native-message-load-more"
            loading={more}
            disabled={more}
            onClick={() => void loadMore()}
          >
            加载更早消息
          </Button>
        )}
      </ScrollView>
    </NativeSocialPage>
  )
}
function NotificationDetail({ id }: { id: string }) {
  const [notice, setNotice] = useState<NotificationResponse['items'][number] | null>(null),
    [error, setError] = useState('')
  const active = useContext(NativeDetailActiveContext)
  useEffect(() => {
    if (!active) return
    let alive = true
    const token = readSession()?.accessToken
    void productRepository
      .getNotification(id)
      .then(async (result) => {
        if (!alive || token !== readSession()?.accessToken) return
        setNotice(result)
        if (!result.readAt) {
          await productRepository.readNotification(id)
          void refreshInbox(true)
        }
      })
      .catch((reason) => {
        if (alive) setError(reason instanceof Error ? reason.message : '通知读取失败')
      })
    return () => {
      alive = false
    }
  }, [id, active])
  return (
    <NativeSocialPage title="消息详情" centerTitle>
      <ScrollView className="native-social-scroll" scrollY>
        <View className="native-mail-notice-detail">
          {error && <Text className="native-error">{error}</Text>}
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
                <Button
                  className="native-button"
                  onClick={() => void openMessageTarget(notice.linkPath)}
                >
                  查看相关内容
                </Button>
              )}
            </>
          ) : (
            !error && <Text className="native-note">正在读取通知…</Text>
          )}
        </View>
      </ScrollView>
    </NativeSocialPage>
  )
}
