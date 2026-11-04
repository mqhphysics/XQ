import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TextDisclosure } from '../interactions/text-disclosure.h5'
import { useOverlayFocus } from '../overlay-focus'
import { resolveMediaUrl } from '../../features/product/product.repository'
import { formatLongDate } from '../../features/product/product.format'
import type { PostSummary } from '../../features/product/product.types'
import './index.h5.scss'

export const ANNOUNCEMENTS_DIALOG_SUPPORTED = true

/** All platform announcements: fixed-size dialog, list on the left, full text on the right. */
export function AnnouncementsDialog({
  announcements,
  initialId,
  onClose,
  onOpenPost,
}: {
  announcements: PostSummary[]
  initialId: string | null
  onClose: () => void
  onOpenPost: (postId: string) => void
}) {
  const [selectedId, setSelectedId] = useState(initialId ?? announcements[0]?.id ?? null)
  const selected = announcements.find((item) => item.id === selectedId) ?? announcements[0]
  const detail = useRef<HTMLElement>(null)
  useOverlayFocus(true, '.announcements-dialog', onClose)
  useEffect(() => {
    detail.current?.scrollTo({ top: 0 })
  }, [selected?.id])
  const image = selected ? resolveMediaUrl(selected.imageUrl) : null
  return createPortal(
    <div
      className="announcements-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="announcements-dialog xq-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcements-dialog-title"
        tabIndex={-1}
      >
        <header className="announcements-dialog__header xq-dialog__header">
          <div>
            <h2 id="announcements-dialog-title">官方公告</h2>
            <p className="announcements-dialog__subtitle">
              平台发布的通知与更新，共 {announcements.length} 条
            </p>
          </div>
          <button
            type="button"
            className="announcements-dialog__close"
            aria-label="关闭官方公告"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className="announcements-dialog__body xq-dialog__body">
          <nav className="announcements-dialog__list" aria-label="公告列表">
            {announcements.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`announcements-dialog__item ${item.id === selected?.id ? 'is-active' : ''}`}
                aria-current={item.id === selected?.id ? 'true' : undefined}
                onClick={() => setSelectedId(item.id)}
              >
                <strong>{item.title || '平台公告'}</strong>
                <small>{formatLongDate(item.publishedAt)}</small>
              </button>
            ))}
          </nav>
          {selected ? (
            <article className="announcements-dialog__detail" ref={detail} aria-live="polite">
              <span className="announcements-dialog__tag">平台公告</span>
              <h3 className="announcements-dialog__title">{selected.title || '平台公告'}</h3>
              <time className="announcements-dialog__date" dateTime={selected.publishedAt}>
                {formatLongDate(selected.publishedAt)}
              </time>
              {image ? (
                <img className="announcements-dialog__image" src={image} alt="" loading="lazy" />
              ) : null}
              <TextDisclosure className="announcements-dialog__text" lines={4}>
                {selected.body.split(/\n+/).map((line, index) => (
                  <p className="announcements-dialog__para" key={index}>
                    {line}
                  </p>
                ))}
              </TextDisclosure>
              <button
                type="button"
                className="announcements-dialog__link"
                onClick={() => onOpenPost(selected.id)}
              >
                查看原帖与评论 →
              </button>
            </article>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  )
}
