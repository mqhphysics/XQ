import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { UserAvatar } from '../product-ui'
import { PostIcon } from '../post-social/icons'
import type { MessageNotification } from './message-categories.h5'

export function NotificationColumns({
  items,
  label,
  onRead,
  onClose,
  onConversation,
}: {
  items: MessageNotification[]
  label: string
  onRead: (item: MessageNotification) => Promise<void>
  onClose: () => void
  onConversation: (id: string) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEffect(() => {
    setSelectedId(null)
  }, [label])
  const selected = items.find((item) => item.id === selectedId)
  const select = async (item: MessageNotification) => {
    setSelectedId(item.id)
    if (!item.readAt) await onRead(item)
  }
  const open = () => {
    if (!selected?.linkPath) return
    const link = selected.linkPath
    const conversation = /[?&]conversationId=([^&]+)/.exec(link)?.[1]
    if (conversation) {
      onConversation(decodeURIComponent(conversation))
      return
    }
    onClose()
    if (
      link.startsWith('/pages/me/index?') &&
      window.location.hash.startsWith('#/pages/me/index')
    ) {
      const panel = new URLSearchParams(link.split('?')[1]).get('panel')
      if (panel === 'reports' || panel === 'identity') {
        window.dispatchEvent(new CustomEvent('xiaoqiu:profile-panel', { detail: panel }))
        return
      }
    }
    if (link.startsWith('/pages/')) void Taro.navigateTo({ url: link })
  }
  return (
    <>
      <aside className="dm-sidebar dm-notification-sidebar">
        <div className="dm-sidebar__label">
          <span>{label}</span>
          <span>{items.length}</span>
        </div>
        <div className="dm-contacts">
          {items.length ? (
            items.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`dm-contact ${selectedId === item.id ? 'is-selected' : ''}`}
                aria-pressed={selectedId === item.id}
                onClick={() => void select(item)}
              >
                <UserAvatar
                  name={item.actor?.displayName ?? '晓球'}
                  avatarUrl={item.actor?.avatarUrl ?? null}
                  size="small"
                />
                <div className="dm-contact__copy">
                  <div>
                    <strong>{item.actor?.displayName ?? '晓球通知'}</strong>
                    <time>
                      {new Date(item.createdAt).toLocaleDateString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                      })}
                    </time>
                  </div>
                  <p>{item.title}</p>
                </div>
                {!item.readAt && <span className="dm-unread dm-unread--dot" aria-label="未读" />}
              </button>
            ))
          ) : (
            <div className="dm-empty">
              {label === '系统消息'
                ? '暂时没有系统消息'
                : label === '收到的赞'
                  ? '暂时没有新的点赞'
                  : label.includes('@')
                    ? '暂时没有提及你的消息'
                    : '暂时没有回复你的消息'}
            </div>
          )}
        </div>
      </aside>
      <div className="dm-thread">
        {selected ? (
          <>
            <header className="dm-thread__head">
              <UserAvatar
                name={selected.actor?.displayName ?? '晓球'}
                avatarUrl={selected.actor?.avatarUrl ?? null}
                size="small"
              />
              <div>
                <strong>{selected.actor?.displayName ?? '晓球通知'}</strong>
                <span>{label}</span>
              </div>
            </header>
            <div className="dm-notification-detail">
              <time>{new Date(selected.createdAt).toLocaleString('zh-CN')}</time>
              <h3>{selected.title}</h3>
              <p>{selected.body ?? '点击下方查看相关内容。'}</p>
              {selected.linkPath && (
                <button type="button" className="dm-notification-action" onClick={open}>
                  查看相关内容 →
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="dm-welcome">
            <PostIcon name="comment" />
            <strong>{label}</strong>
            <p>在中间选择一条消息，查看完整内容。</p>
          </div>
        )}
      </div>
    </>
  )
}
