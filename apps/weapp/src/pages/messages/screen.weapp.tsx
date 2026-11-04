import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance, useDidHide, useDidShow } from '@tarojs/taro'
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { NativeSocialPage } from '../../components/native-social/page-frame.weapp'
import { UserAvatar } from '../../components/product-ui'
import { DataState } from '../../components/public-ui'
import {
  messageCategories,
  notificationCategory,
  type MessageCategory,
} from '../../components/messaging-drawer/message-categories.h5'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { formatRelativeTime } from '../../features/product/product.format'
import type { NotificationResponse } from '../../features/product/product.types'
import { NativeDetailActiveContext } from '../../features/native-navigation/detail-context.weapp'
import {
  openNativeDetail,
  switchNativeSection,
  useNativeRouteState,
} from '../../features/native-navigation/index.weapp'
import { NativeRefreshIndicator } from '../../features/product/native-refresh.weapp'
import './index.weapp.scss'
type Notice = NotificationResponse['items'][number]
export interface NativeMessagesParams {
  notificationId?: string | undefined
  conversationId?: string | undefined
  userId?: string | undefined
  new?: string | undefined
}
export default function NativeMessagesScreen(supplied: NativeMessagesParams = {}) {
  const params = { ...getCurrentInstance().router?.params, ...supplied }
  const noticeId = params.notificationId || ''
  const active = useContext(NativeDetailActiveContext)
  const [visible, setVisible] = useState(true)
  useDidHide(() => setVisible(false))
  useDidShow(() => setVisible(true))
  const [storedCategory, setCategory] = useNativeRouteState<MessageCategory>(
    'mail-category',
    'system',
  )
  const category = messageCategories.some((item) => item.id === storedCategory)
    ? storedCategory
    : 'system'
  const [notifications, setNotifications] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState('')
  const sequence = useRef(0)
  const notice = notifications.find((item) => item.id === noticeId)
  const load = useCallback(
    async (silent = false) => {
      const ticket = ++sequence.current,
        owner = readSession()?.user.id
      if (!owner) {
        setError('请先登录账号查看通知')
        setLoading(false)
        setRefreshing(false)
        return
      }
      if (!silent) setLoading(true)
      try {
        const result = await productRepository.getNotifications()
        if (ticket !== sequence.current || readSession()?.user.id !== owner) return
        setNotifications(result.items.filter((item) => item.type !== 'DIRECT_MESSAGE'))
        if (noticeId && result.items.some((item) => item.id === noticeId && !item.readAt)) {
          const read = await productRepository.readNotification(noticeId)
          if (ticket === sequence.current && readSession()?.user.id === owner)
            setNotifications(read.items.filter((item) => item.type !== 'DIRECT_MESSAGE'))
        }
        setError('')
      } catch (issue) {
        if (ticket === sequence.current)
          setError(issue instanceof Error ? issue.message : '通知读取失败')
      } finally {
        if (ticket === sequence.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [noticeId],
  )
  useEffect(() => {
    if (!active || !visible) return
    void load()
    const timer = setInterval(() => void load(true), 20000)
    return () => {
      clearInterval(timer)
      sequence.current++
    }
  }, [load, active, visible])
  const related = async () => {
    const url = notice?.linkPath
    if (!url?.startsWith('/pages/')) return
    if (url.includes('conversationId=') || url.includes('/compose/')) {
      void Taro.showToast({ title: '该功能已退出', icon: 'none' })
      return
    }
    if (url.startsWith('/pages/me/')) await switchNativeSection('me')
    else if (url.startsWith('/pages/my-team/')) await switchNativeSection('team')
    else await openNativeDetail(url)
  }
  const markAll = async () => {
    const owner = readSession()?.accessToken
    try {
      const result = await productRepository.readAllNotifications()
      if (owner === readSession()?.accessToken)
        setNotifications(result.items.filter((item) => item.type !== 'DIRECT_MESSAGE'))
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '标记失败，请重试')
    }
  }
  const rows = notifications.filter((item) => notificationCategory(item) === category)
  return (
    <NativeSocialPage
      title={noticeId ? '消息详情' : '消息'}
      action={
        !noticeId ? (
          <Button className="native-button native-button--quiet" onClick={() => void markAll()}>
            全部已读
          </Button>
        ) : undefined
      }
    >
      {error && (
        <View className="native-mail-error">
          <Text>{error}</Text>
          <Button className="native-button" onClick={() => void load()}>
            重新读取
          </Button>
        </View>
      )}
      {noticeId ? (
        <ScrollView className="native-social-scroll" scrollY>
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
            ) : (
              <Text>{loading ? '正在读取通知…' : '这条通知暂不可用'}</Text>
            )}
          </View>
        </ScrollView>
      ) : (
        <View className="native-mail-main">
          <View
            className="native-mail-categories"
            role="tablist"
            onTouchStart={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
            onTouchEnd={(event) => event.stopPropagation()}
          >
            {messageCategories.map((item) => {
              const count = notifications.filter(
                (n) => notificationCategory(n) === item.id && !n.readAt,
              ).length
              return (
                <Button
                  key={item.id}
                  aria-selected={category === item.id}
                  className={'native-mail-category' + (category === item.id ? ' is-active' : '')}
                  onClick={() => setCategory(item.id)}
                >
                  <Text>{item.label}</Text>
                  {count > 0 && <Text className="native-mail-badge">{count}</Text>}
                </Button>
              )
            })}
          </View>
          <ScrollView
            className="native-social-scroll"
            scrollY
            showScrollbar={false}
            enhanced
            refresherEnabled
            refresherDefaultStyle="none"
            refresherTriggered={refreshing}
            onRefresherRefresh={() => {
              setRefreshing(true)
              void load(true)
            }}
          >
            <NativeRefreshIndicator spinning={refreshing} />
            {loading && !notifications.length && <DataState kind="loading" title="正在读取通知" />}
            {rows.map((item) => (
              <Button
                key={item.id}
                className="native-mail-contact"
                onClick={() =>
                  void openNativeDetail(
                    '/pages/messages/index?notificationId=' + encodeURIComponent(item.id),
                  )
                }
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
            {!loading && !rows.length && (
              <Text className="native-mail-empty">
                暂时没有{messageCategories.find((item) => item.id === category)?.label}
              </Text>
            )}
          </ScrollView>
        </View>
      )}
    </NativeSocialPage>
  )
}
