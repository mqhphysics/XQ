import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { productRepository } from '../../features/product/product.repository'
import type { NotificationResponse } from '../../features/product/product.types'
import { useOverlayFocus } from '../overlay-focus'
import { PostIcon } from '../post-social/icons'
import { readSession } from '../../features/product/session'
import {
  visibleMessageCategories,
  notificationCategory,
  type MessageCategory,
} from './message-categories.h5'
import { NotificationColumns } from './notification-columns.h5'
import { usePreferenceValues } from '../settings-dialog/preferences.h5'
import { SettingsDialog } from '../settings-dialog/index.h5'
import { ProfileIcon } from '../../pages/me/profile-icons.h5'
import { openMessaging, subscribeMessaging } from './api.h5'
import './index.scss'
import './index.h5.scss'
export { openMessaging }
export function MessagingDrawer() {
  return null
}
export function MessagingOverlayHost() {
  const [open, setOpen] = useState(false),
    [settings, setSettings] = useState(false)
  const [category, setCategory] = useState<MessageCategory>('system')
  const [notifications, setNotifications] = useState<NotificationResponse>({
    items: [],
    unreadCount: 0,
  })
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(false)
  const preferences = usePreferenceValues(),
    owner = readSession()?.accessToken
  const sequence = useRef(0)
  const close = useCallback(() => {
    setOpen(false)
    sequence.current++
  }, [])
  useOverlayFocus(open && !settings, '.message-drawer', close)
  useEffect(() => {
    close()
    setNotifications({ items: [], unreadCount: 0 })
  }, [owner, close])
  useEffect(
    () =>
      subscribeMessaging((request) => {
        if (request && !('category' in request)) {
          void Taro.showToast({ title: '私信功能已退出', icon: 'none' })
          return
        }
        if (!readSession()) {
          void Taro.showToast({ title: '登录后可以查看通知', icon: 'none' })
          return
        }
        setCategory(request && request.category !== 'messages' ? request.category : 'system')
        setOpen(true)
      }),
    [],
  )
  const load = useCallback(async () => {
    const ticket = ++sequence.current,
      token = readSession()?.accessToken
    setLoading(true)
    try {
      const value = await productRepository.getNotifications()
      if (ticket === sequence.current && token === readSession()?.accessToken) {
        setNotifications({
          ...value,
          items: value.items.filter((item) => item.type !== 'DIRECT_MESSAGE'),
        })
        setError('')
      }
    } catch (issue) {
      if (ticket === sequence.current)
        setError(issue instanceof Error ? issue.message : '通知读取失败')
    } finally {
      if (ticket === sequence.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    if (!open) return
    void load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 20000)
    return () => {
      clearInterval(timer)
      sequence.current++
    }
  }, [open, load])
  useEffect(() => {
    document.body.classList.toggle('xiaoqiu-messaging-open', open)
    return () => document.body.classList.remove('xiaoqiu-messaging-open')
  }, [open])
  if (!open) return null
  const categories = visibleMessageCategories(preferences)
  const selected =
    categories.find((item) => item.id === category) ??
    categories.find((item) => item.id === 'system')!
  return createPortal(
    <div className="message-layer message-layer--desktop">
      <section
        className="message-drawer message-drawer--desktop"
        role="dialog"
        aria-label="通知"
        tabIndex={-1}
      >
        <header className="dm-head">
          <div>
            <PostIcon name="comment" />
            <h2>消息中心</h2>
            <span>系统通知与处理结果</span>
          </div>
          <button type="button" aria-label="关闭通知" onClick={close}>
            <PostIcon name="close" />
          </button>
        </header>
        <div className="dm-workspace">
          <nav className="dm-categories" aria-label="消息分类">
            <div>
              {categories.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={selected.id === item.id ? 'is-active' : ''}
                  aria-current={selected.id === item.id ? 'page' : undefined}
                  onClick={() => setCategory(item.id)}
                >
                  <span>{item.label}</span>
                  {notifications.items.some(
                    (value) => !value.readAt && notificationCategory(value) === item.id,
                  ) && <i aria-label="有未读消息" />}
                </button>
              ))}
            </div>
            <button type="button" className="dm-message-settings" onClick={() => setSettings(true)}>
              <ProfileIcon name="settings" />
              消息设置
            </button>
          </nav>
          {error ? (
            <div className="dm-error" role="alert">
              {error}
              <button type="button" onClick={() => void load()}>
                重新读取
              </button>
            </div>
          ) : loading && !notifications.items.length ? (
            <div className="dm-empty">正在读取通知…</div>
          ) : (
            <NotificationColumns
              items={notifications.items.filter(
                (item) => notificationCategory(item) === selected.id,
              )}
              label={selected.label}
              onClose={close}
              onConversation={() => {
                void Taro.showToast({ title: '私信功能已退出', icon: 'none' })
              }}
              onRead={async (item) => {
                const token = readSession()?.accessToken
                const next = await productRepository.readNotification(item.id)
                if (token === readSession()?.accessToken)
                  setNotifications({
                    ...next,
                    items: next.items.filter((value) => value.type !== 'DIRECT_MESSAGE'),
                  })
              }}
            />
          )}
        </div>
      </section>
      {settings && <SettingsDialog section="messages" onClose={() => setSettings(false)} />}
    </div>,
    document.body,
  )
}
