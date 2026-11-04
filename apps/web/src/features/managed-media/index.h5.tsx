import Taro from '@tarojs/taro'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayFocus } from '../../components/overlay-focus/index.h5'
import { CoverCropper } from '../../components/avatar-cropper/index.h5'
import { readSession, subscribeToExternalSessionChanges } from '../product/session.h5'
import { resolveMediaUrl } from '../product/product.repository'
import {
  fileDataUrl,
  mediaRequest,
  privateMediaBlob,
  readMediaCapabilities,
  videoPoster,
  type MediaAsset,
  type MediaCapabilities,
  type MediaPage,
  type MediaPurpose,
} from './repository.h5'
import './index.h5.scss'

const LABELS: Record<MediaPurpose, string> = {
  GOAL_GIF: '进球 GIF',
  EVENT_CLIP: '比赛片段',
  USER_AVATAR: '账户头像',
  USER_BACKGROUND: '个人背景',
  PLAYER_PORTRAIT: '球员照片',
  TEAM_CREST: '球队队徽',
  TEAM_BACKGROUND: '球队背景',
}
const showError = (error: unknown) =>
  void Taro.showToast({ title: error instanceof Error ? error.message : '操作失败', icon: 'none' })
const mediaChanged = () => window.dispatchEvent(new Event('xiaoqiu:media-changed'))

function MediaDialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const id = `managed-media-${useId().replace(/:/g, '')}`
  useOverlayFocus(true, `#${id}`, onClose)
  return createPortal(
    <div
      className="managed-media-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        id={id}
        className={`managed-media-dialog xq-dialog${wide ? ' managed-media-dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="xq-dialog__header">
          <h2>{title}</h2>
          <button data-media-control type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <div className="xq-dialog__body">{children}</div>
      </section>
    </div>,
    document.body,
  )
}

export function MediaUploadButton({
  purpose,
  targetId,
  label,
  onSubmitted,
  compact = false,
  renderTrigger,
}: {
  purpose: MediaPurpose
  targetId: string
  label?: string
  onSubmitted?: () => void
  compact?: boolean
  /** Custom trigger (e.g. the timeline's “+” tile) instead of the default text button. */
  renderTrigger?: (props: { open: () => void; busy: boolean }) => ReactNode
}) {
  const [capabilities, setCapabilities] = useState<MediaCapabilities | null>(null)
  const [opening, setOpening] = useState(false)
  const open = async () => {
    if (opening) return
    setOpening(true)
    try {
      const data = await readMediaCapabilities()
      if (!data.enabled) throw new Error('功能暂未开放')
      if (!data.canSubmit) throw new Error('当前账号无投稿权限')
      if (
        purpose === 'PLAYER_PORTRAIT' &&
        data.linkedPlayerId !== targetId &&
        !data.canManageAnyPlayerPortrait
      )
        throw new Error('只能投稿本人已关联的球员照片')
      setCapabilities(data)
    } catch (error) {
      showError(error)
    } finally {
      setOpening(false)
    }
  }
  // Only a real account switch closes the dialog. Plain session events also fire on every window
  // focus — e.g. returning from the native file chooser — which used to close the cropper the
  // moment a background image had been picked, so nothing was ever set.
  useEffect(() => subscribeToExternalSessionChanges(() => setCapabilities(null)), [])
  return (
    <>
      {renderTrigger ? (
        renderTrigger({ open: () => void open(), busy: opening })
      ) : (
        <button
          data-media-control
          type="button"
          className={`managed-media-button${compact ? ' managed-media-button--compact' : ''}`}
          aria-busy={opening}
          disabled={opening}
          onClick={() => void open()}
        >
          {compact ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="m16 3 5 5-12 12H4v-5Z" />
              <path d="m14 5 5 5" />
            </svg>
          ) : null}
          {label ?? `上传${LABELS[purpose]}`}
        </button>
      )}
      {capabilities && purpose === 'USER_BACKGROUND' ? (
        <CoverCropper
          onCancel={() => setCapabilities(null)}
          onConfirm={async (dataUrl) => {
            // Personal images go live at once; admins review afterwards and can take them down.
            await mediaRequest<MediaAsset>(
              'media-assets',
              { purpose, targetId, clientSubmissionId: crypto.randomUUID(), dataUrl },
              'POST',
            )
            setCapabilities(null)
            mediaChanged()
            onSubmitted?.()
            void Taro.showToast({ title: '个人背景已更新', icon: 'success' })
          }}
        />
      ) : capabilities ? (
        <UploadDialog
          purpose={purpose}
          targetId={targetId}
          direct={capabilities.canDirectPublish}
          onClose={() => setCapabilities(null)}
          onSubmitted={() => {
            mediaChanged()
            onSubmitted?.()
            if (purpose === 'EVENT_CLIP') {
              setCapabilities(null)
              void Taro.showToast({ title: '已上传到比赛时间线', icon: 'success' })
            }
          }}
        />
      ) : null}
    </>
  )
}

function UploadDialog({
  purpose,
  targetId,
  direct,
  onClose,
  onSubmitted,
}: {
  purpose: MediaPurpose
  targetId: string
  direct: boolean
  onClose: () => void
  onSubmitted: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const [preview, setPreview] = useState('')
  useEffect(() => {
    if (!file || purpose === 'GOAL_GIF') {
      setPreview('')
      return
    }
    // Event clips preview both GIFs and MP4s.
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file, purpose])
  // Kept across retry of this file. A new selected file gets its own idempotency key.
  const clientId = useRef(crypto.randomUUID())
  const submit = async () => {
    if (!file || busy) return
    setBusy(true)
    setMessage('')
    try {
      if (file.size > fileLimit(purpose, file))
        throw new Error(
          purpose === 'EVENT_CLIP'
            ? 'GIF 不能超过 6 MiB，MP4 不能超过 10 MiB'
            : purpose === 'GOAL_GIF'
              ? 'GIF 不能超过 6 MiB'
              : '图片太大，请换一张',
        )
      let posterDataUrl: string | undefined
      if (purpose === 'EVENT_CLIP' && file.type === 'video/mp4') {
        const still = await videoPoster(file)
        if (still.durationMs > 15_000) throw new Error('短视频需为 15 秒以内')
        posterDataUrl = still.dataUrl
      }
      if (purpose !== 'EVENT_CLIP' && purpose !== 'GOAL_GIF' && file.type !== 'image/gif') {
        const size = await createImageBitmap(file).then(
          (bitmap) => {
            const frame = { width: bitmap.width, height: bitmap.height }
            bitmap.close()
            return frame
          },
          () => null,
        )
        if (size && (size.width < 64 || size.height < 64))
          throw new Error(`图片太小（${size.width}×${size.height}），请选择至少 64×64 像素的图片`)
      }
      const dataUrl =
        purpose === 'USER_BACKGROUND' ? await compressCover(file) : await fileDataUrl(file)
      const item = await mediaRequest<MediaAsset>(
        'media-assets',
        {
          purpose,
          targetId,
          clientSubmissionId: clientId.current,
          dataUrl,
          ...(posterDataUrl ? { posterDataUrl } : {}),
        },
        'POST',
      )
      setMessage(
        purpose === 'EVENT_CLIP'
          ? '已上传，已在时间线展示'
          : item.status === 'APPROVED'
            ? '已生效'
            : '投稿已提交，可在“我的投稿”查看处理进度',
      )
      setSuccess(true)
      onSubmitted()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '上传失败，请重试')
    } finally {
      setBusy(false)
    }
  }
  return (
    <MediaDialog
      title={`${purpose === 'USER_BACKGROUND' ? '更换' : '上传'}${LABELS[purpose]}`}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <div className="managed-media-form">
        <p>
          {purpose === 'EVENT_CLIP'
            ? 'GIF ≤ 6 MiB（16–960 像素）或 MP4 短视频 ≤ 10 MiB，单次 ≤ 15 秒。'
            : purpose === 'GOAL_GIF'
              ? 'GIF ≤ 6 MiB，16–960 像素，2–120 帧，单次 ≤ 15 秒。'
              : purpose === 'USER_AVATAR'
                ? 'JPEG、PNG 或静态 WebP，最大 4 MiB；头像需为 64–512 像素的正方形。'
                : purpose === 'USER_BACKGROUND'
                  ? `背景按 2.8:1 横幅显示，建议 ${COVER_RECOMMENDED.width}×${COVER_RECOMMENDED.height}；超过 ${COVER_MAX.width}×${COVER_MAX.height} 会自动压缩，低于 1120×400 可能显得模糊。`
                  : 'JPEG、PNG 或静态 WebP，最大 4 MiB。'}
        </p>
        <p>
          {purpose === 'EVENT_CLIP'
            ? '上传后立即在比赛时间线展示；管理员会复核，不合适的内容会被撤下。'
            : direct
              ? '总管理员上传后直接发布。'
              : '上传后立即生效，管理员事后复核；不合适的内容会被撤下。'}
        </p>
        <label data-media-field className="managed-media-picker">
          <input
            data-media-input
            type="file"
            accept={
              purpose === 'EVENT_CLIP'
                ? 'image/gif,video/mp4'
                : purpose === 'GOAL_GIF'
                  ? 'image/gif'
                  : 'image/jpeg,image/png,image/webp'
            }
            disabled={busy || success}
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null
              const allowed =
                purpose === 'EVENT_CLIP'
                  ? ['image/gif', 'video/mp4']
                  : purpose === 'GOAL_GIF'
                    ? ['image/gif']
                    : ['image/jpeg', 'image/png', 'image/webp']
              if (
                selected &&
                (!allowed.includes(selected.type) || selected.size > fileLimit(purpose, selected))
              ) {
                setFile(null)
                setMessage('请选择符合格式和大小要求的文件')
                return
              }
              setFile(selected)
              clientId.current = crypto.randomUUID()
              setMessage('')
            }}
          />
          {preview && file?.type === 'video/mp4' ? (
            <video
              className="managed-media-picker__preview"
              src={preview}
              muted
              playsInline
              autoPlay
              loop
            />
          ) : preview ? (
            <img
              className={
                'managed-media-picker__preview' +
                (purpose === 'USER_BACKGROUND' ? ' managed-media-picker__preview--cover' : '')
              }
              src={preview}
              alt="待上传图片预览"
            />
          ) : (
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="8" cy="8" r="1.5" />
              <path d="m3 17 5-5 4 4 4-6 5 7" />
            </svg>
          )}
          <strong>
            {file?.name ?? (purpose === 'EVENT_CLIP' ? '点击选择 GIF 或 MP4' : '点击选择图片')}
          </strong>
          <small>
            {file
              ? '重新选择'
              : purpose === 'EVENT_CLIP'
                ? '记录这个瞬间'
                : '选择一张属于你的球场记忆'}
          </small>
        </label>
        {purpose === 'GOAL_GIF' ? (
          <small>该投稿只关联当前进球事件，事件更正或撤销后停止展示。</small>
        ) : null}
        <div role="status">{message}</div>
        <button
          data-media-control
          type="button"
          className="managed-media-button"
          disabled={!file || busy || success}
          onClick={() => void submit()}
        >
          {busy ? '上传中…' : '提交'}
        </button>
      </div>
    </MediaDialog>
  )
}

export function GoalMedia({ asset }: { asset: MediaAsset }) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const playing = playingId === asset.id
  const [loaded, setLoaded] = useState(false)
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => {
      setReduced(query.matches)
      setPlayingId(null)
    }
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    if (!playing) return
    const timer = loaded
      ? window.setTimeout(() => setPlayingId(null), asset.durationMs + 250)
      : undefined
    const stop = () => {
      if (document.hidden) setPlayingId(null)
    }
    document.addEventListener('visibilitychange', stop)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', stop)
    }
  }, [playing, loaded, asset.durationMs])
  return (
    <div className="goal-media">
      <button
        type="button"
        aria-label={
          playing
            ? '停止进球 GIF'
            : `播放一次进球 GIF，${(asset.bytes / 1024 / 1024).toFixed(1)} MiB${reduced ? '，已开启减少动画' : ''}`
        }
        aria-pressed={playing}
        onClick={() => {
          setLoaded(false)
          setPlayingId(playing ? null : asset.id)
        }}
      >
        <img
          key={playing ? asset.contentUrl : asset.posterUrl}
          src={resolveMediaUrl(playing ? asset.contentUrl : asset.posterUrl)}
          alt="进球回放"
          loading="lazy"
          decoding="async"
          onLoad={() => {
            if (playing) setLoaded(true)
          }}
          onError={() => {
            setPlayingId(null)
            showError(new Error('进球媒体已撤下或不可用'))
          }}
        />
        <span>
          {playing ? '停止播放' : '播放 GIF'} · {(asset.bytes / 1024 / 1024).toFixed(1)} MiB
          {reduced && !playing ? ' · 点击播放一次' : ''}
        </span>
      </button>
    </div>
  )
}

/** Timeline thumbnail for an event GIF/clip; opens a player dialog. */
export function EventMediaThumb({ asset, label }: { asset: MediaAsset; label: string }) {
  const [open, setOpen] = useState(false)
  const video = asset.mimeType === 'video/mp4'
  return (
    <>
      <button
        type="button"
        data-media-control
        className="event-media-thumb"
        aria-label={`播放${label}${video ? '短视频' : ' GIF'}`}
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
      >
        <img src={resolveMediaUrl(asset.posterUrl)} alt="" loading="lazy" decoding="async" />
        <span className="event-media-thumb__badge" aria-hidden="true">
          {video ? '▶' : 'GIF'}
        </span>
      </button>
      {open ? (
        <MediaDialog title={label} onClose={() => setOpen(false)} wide>
          <div className="event-media-player">
            {video ? (
              <video
                src={resolveMediaUrl(asset.contentUrl)}
                poster={resolveMediaUrl(asset.posterUrl)}
                controls
                autoPlay
                playsInline
              />
            ) : (
              <img src={resolveMediaUrl(asset.contentUrl)} alt={label} />
            )}
          </div>
        </MediaDialog>
      ) : null}
    </>
  )
}

export function useMatchGoalMedia(matchId: string) {
  const [items, setItems] = useState<MediaAsset[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const load = () =>
      void mediaRequest<{ items: MediaAsset[] }>(
        `media-assets/matches/${encodeURIComponent(matchId)}/goals`,
      )
        .then((data) => {
          if (active) {
            setItems(data.items)
            setError('')
          }
        })
        .catch((reason) => {
          if (active) {
            setItems([])
            setError(reason instanceof Error ? reason.message : '进球媒体读取失败')
          }
        })
    setItems([])
    load()
    window.addEventListener('xiaoqiu:media-changed', load)
    return () => {
      active = false
      window.removeEventListener('xiaoqiu:media-changed', load)
    }
  }, [matchId])
  return { items, error }
}

export function MediaLibraryButton({ review = false }: { review?: boolean }) {
  const [open, setOpen] = useState(false)
  const label = review ? '媒体审核' : '我的投稿'
  useEffect(() => subscribeToExternalSessionChanges(() => setOpen(false)), [])
  const show = async () => {
    try {
      const capability = await readMediaCapabilities()
      if (!capability.enabled) throw new Error('功能暂未开放')
      if (review && !capability.canReview) throw new Error('当前账号无媒体审核权限')
      setOpen(true)
    } catch (error) {
      showError(error)
    }
  }
  return (
    <>
      <button type="button" className="managed-media-button" onClick={() => void show()}>
        {label}
      </button>
      {open ? (
        <MediaDialog title={label} onClose={() => setOpen(false)}>
          <MediaLibrary review={review} />
        </MediaDialog>
      ) : null}
    </>
  )
}

function PrivatePoster({ asset }: { asset: MediaAsset }) {
  const [url, setUrl] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  const element = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!element.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '100px' },
    )
    observer.observe(element.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    let objectUrl = ''
    void privateMediaBlob(asset.posterUrl, controller.signal)
      .then((blob) => {
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob)
          setUrl(objectUrl)
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message)
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [asset.posterUrl, visible])
  return (
    <div ref={element} className="media-private-poster">
      {url ? (
        <img src={url} alt={`${LABELS[asset.purpose]}投稿静态封面`} />
      ) : (
        <button type="button" onClick={() => setVisible(true)}>
          {error || '查看封面'}
        </button>
      )}
    </div>
  )
}

// Pending/hidden GIFs require the same authenticated fetch as their private posters.
// The animation is fetched only after an explicit click, including with reduced motion.
function PrivateGifPreview({ asset }: { asset: MediaAsset }) {
  const [playing, setPlaying] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!playing) return
    const controller = new AbortController()
    let objectUrl = ''
    void privateMediaBlob(asset.contentUrl, controller.signal)
      .then((blob) => {
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob)
          setUrl(objectUrl)
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setPlaying(false)
          showError(error)
        }
      })
    return () => {
      controller.abort()
      setUrl('')
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [asset.contentUrl, playing])
  useEffect(() => {
    if (!playing) return
    const timer = loaded
      ? window.setTimeout(() => setPlaying(false), asset.durationMs + 250)
      : undefined
    const stop = () => {
      if (document.hidden) setPlaying(false)
    }
    document.addEventListener('visibilitychange', stop)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', stop)
    }
  }, [asset.durationMs, loaded, playing])
  return (
    <div className="goal-media media-private-gif">
      <button
        type="button"
        aria-pressed={playing}
        onClick={() => {
          setLoaded(false)
          setPlaying((value) => !value)
        }}
      >
        {playing && url ? (
          <img
            src={url}
            alt="投稿 GIF 授权预览"
            onLoad={() => setLoaded(true)}
            onError={() => {
              setPlaying(false)
              showError(new Error('投稿 GIF 无法解码'))
            }}
          />
        ) : null}
        <span>
          {playing ? (url ? '停止预览' : '正在加载，点击取消') : '播放投稿 GIF 一次'} ·{' '}
          {(asset.bytes / 1024 / 1024).toFixed(1)} MiB
        </span>
      </button>
    </div>
  )
}

function MediaLibrary({ review }: { review: boolean }) {
  const [items, setItems] = useState<MediaAsset[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const path = review ? 'admin/media-assets' : 'media-assets/mine'
  const load = useCallback(
    async (before?: string) => {
      try {
        const data = await mediaRequest<MediaPage>(
          `${path}${before ? `?before=${encodeURIComponent(before)}` : ''}`,
        )
        setItems((current) => (before ? [...current, ...data.items] : data.items))
        setNext(data.nextCursor)
        setMessage('')
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '投稿读取失败')
      }
    },
    [path],
  )
  useEffect(() => {
    void load()
  }, [load])
  const act = async (item: MediaAsset, action: string) => {
    if (busy) return
    setBusy(true)
    try {
      const reviewAction = action === 'APPROVE' || action === 'REJECT'
      const updated = await mediaRequest<MediaAsset>(
        reviewAction
          ? `admin/media-assets/${item.id}/review`
          : `media-assets/${item.id}/visibility`,
        { action, expectedVersion: item.version, reason: reasons[item.id] ?? '' },
        'PUT',
      )
      setItems((current) => current.map((row) => (row.id === updated.id ? updated : row)))
      setMessage('操作已保存')
      mediaChanged()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="media-library">
      <div role="status">{message}</div>
      <button type="button" className="managed-media-button" onClick={() => void load()}>
        刷新
      </button>
      {items.length === 0 && !message ? <p>暂无投稿</p> : null}
      {items.map((item) => (
        <article key={item.id}>
          <PrivatePoster asset={item} />
          <div className="media-library__copy">
            <strong>{LABELS[item.purpose]}</strong>
            <span>
              {item.status === 'PENDING'
                ? '待审核'
                : item.status === 'APPROVED'
                  ? item.awaitingReview
                    ? review
                      ? '已展示 · 待复核'
                      : '已生效'
                    : '已通过'
                  : review
                    ? '已下架'
                    : '已驳回'}
              {item.visibility !== 'ACTIVE'
                ? ` · ${item.visibility === 'HIDDEN' ? '已隐藏' : '已删除（可恢复）'}`
                : ''}
            </span>
            <small>{item.targetLabel}</small>
            {item.purpose === 'GOAL_GIF' ||
            (item.purpose === 'EVENT_CLIP' && item.mimeType === 'image/gif') ? (
              <PrivateGifPreview asset={item} />
            ) : null}
            {item.associationState === 'REMOVED_OR_CHANGED' ? (
              <p>关联目标已更正或撤销，停止公开展示。请针对新事件重新投稿。</p>
            ) : null}
            {item.reviewReason ? <p>审核反馈：{item.reviewReason}</p> : null}
            {review ? (
              <label>
                审核意见
                <textarea
                  value={reasons[item.id] ?? ''}
                  maxLength={1000}
                  onChange={(event) =>
                    setReasons((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                  placeholder="驳回时必须填写原因"
                />
              </label>
            ) : null}
            <div className="media-library__actions">
              {review && item.visibility !== 'DELETED' ? (
                <>
                  <button
                    type="button"
                    disabled={busy || item.associationState !== 'CURRENT'}
                    onClick={() => void act(item, 'APPROVE')}
                  >
                    通过
                  </button>
                  <button type="button" disabled={busy} onClick={() => void act(item, 'REJECT')}>
                    {item.status === 'APPROVED' ? '下架' : '驳回'}
                  </button>
                </>
              ) : null}
              {item.visibility === 'ACTIVE' ? (
                <button type="button" disabled={busy} onClick={() => void act(item, 'HIDE')}>
                  隐藏
                </button>
              ) : item.canRestore ? (
                <button type="button" disabled={busy} onClick={() => void act(item, 'RESTORE')}>
                  恢复
                </button>
              ) : null}
              {item.visibility !== 'DELETED' ? (
                <button type="button" disabled={busy} onClick={() => void act(item, 'DELETE')}>
                  删除
                </button>
              ) : null}
            </div>
          </div>
        </article>
      ))}
      {next ? (
        <button type="button" className="managed-media-button" onClick={() => void load(next)}>
          加载更多
        </button>
      ) : null}
    </div>
  )
}

export function MediaAccountEntry({
  includeBackground = true,
}: { includeBackground?: boolean } = {}) {
  const user = readSession()?.user
  const [canReview, setCanReview] = useState(false)
  useEffect(() => {
    let active = true
    const refresh = () =>
      void readMediaCapabilities()
        .then((data) => {
          if (active) setCanReview(data.canReview)
        })
        .catch(() => {
          if (active) setCanReview(false)
        })
    refresh()
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      window.removeEventListener('focus', refresh)
    }
  }, [user?.id, user?.organizationId])
  if (!user) return null
  const reviewer = user.roles.some(
    (role) => role.role === 'PLATFORM_ADMIN' && role.scopeType === 'PLATFORM',
  )
  return (
    <div className="media-account-entry">
      {includeBackground && (
        <MediaUploadButton purpose="USER_BACKGROUND" targetId={user.id} label="更换个人背景" />
      )}
      <MediaLibraryButton />
      {user.linkedPlayer ? (
        <MediaUploadButton purpose="PLAYER_PORTRAIT" targetId={user.linkedPlayer.id} />
      ) : null}
      {reviewer || canReview ? <MediaLibraryButton review /> : null}
    </div>
  )
}

export function usePersonalBackground(userId: string | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setUrl(null)
    const load = () => {
      if (userId)
        void mediaRequest<{ backgroundUrl: string | null }>(
          `media-assets/users/${encodeURIComponent(userId)}/presentation`,
        )
          .then((data) => {
            if (active) setUrl(data.backgroundUrl)
          })
          .catch(() => {
            if (active) setUrl(null)
          })
    }
    load()
    window.addEventListener('xiaoqiu:media-changed', load)
    return () => {
      active = false
      window.removeEventListener('xiaoqiu:media-changed', load)
    }
  }, [userId])
  return resolveMediaUrl(url)
}

/** Personal / team covers are shown as a 2.80:1 banner. */
export const COVER_RATIO = 2.8
export const COVER_RECOMMENDED = { width: 1680, height: 600 }
export const COVER_MAX = { width: 2240, height: 800 }

function fileLimit(purpose: MediaPurpose, file: File) {
  if (purpose === 'EVENT_CLIP' && file.type === 'video/mp4') return 10 * 1024 * 1024
  return sourceLimit(purpose)
}

function sourceLimit(purpose: MediaPurpose) {
  if (purpose === 'GOAL_GIF' || purpose === 'EVENT_CLIP') return 6 * 1024 * 1024
  // Covers are cropped and re-encoded in the browser first, so large camera photos are fine.
  if (purpose === 'USER_BACKGROUND') return 25 * 1024 * 1024
  return 4 * 1024 * 1024
}

/**
 * Centre-crop to 2.80:1 (the same frame the card shows) and scale down to at most 2240×800.
 * Smaller photos are never enlarged. Output is WebP (JPEG fallback) well under the 4 MiB API limit.
 */
export async function compressCover(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const crop = coverCrop(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = crop.outWidth
    canvas.height = crop.outHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法处理图片')
    context.imageSmoothingQuality = 'high'
    context.drawImage(
      bitmap,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      0,
      0,
      crop.outWidth,
      crop.outHeight,
    )
    for (const quality of [0.86, 0.78, 0.68]) {
      let url = canvas.toDataURL('image/webp', quality)
      if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', quality)
      if (url.length * 0.75 < 3.5 * 1024 * 1024) return url
    }
    throw new Error('图片压缩后仍然过大，请换一张')
  } finally {
    bitmap.close()
  }
}

export function coverCrop(width: number, height: number) {
  let sw = width
  let sh = Math.round(width / COVER_RATIO)
  if (sh > height) {
    sh = height
    sw = Math.round(height * COVER_RATIO)
  }
  const sx = Math.round((width - sw) / 2)
  const sy = Math.round((height - sh) / 2)
  const scale = Math.min(1, COVER_MAX.width / sw)
  return { sx, sy, sw, sh, outWidth: Math.round(sw * scale), outHeight: Math.round(sh * scale) }
}
