import Taro from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayFocus } from '../overlay-focus'
import { IconButton } from '../icon-button'
import './index.scss'
import './native.h5.scss'

const ZOOM_MIN = 1
const ZOOM_MAX = 3
const SOURCE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

type Shape = 'circle' | 'rect'
type Frame = { width: number; height: number }
type Encoder = (image: HTMLImageElement, draw: DrawPlan) => Promise<string>
/** Image placement inside the stage, in stage pixels. */
type DrawPlan = {
  stage: Frame
  left: number
  top: number
  width: number
  height: number
  scale: number
}

export function AvatarCropper({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: (dataUrl: string) => Promise<void>
}) {
  return (
    <ImageCropDialog
      kicker="AVATAR"
      title="更换头像"
      shape="circle"
      stage={{ width: 240, height: 240 }}
      note="拖动照片或调整数值，让头像出现在圆形区域内。"
      saveLabel="保存头像"
      encode={encodeAvatar}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}

/** Personal background: cropped at the real 2.8:1 banner ratio. */
export function CoverCropper({
  onCancel,
  onConfirm,
  title = '更换个人背景',
}: {
  onCancel: () => void
  onConfirm: (dataUrl: string) => Promise<void>
  title?: string
}) {
  return (
    <ImageCropDialog
      kicker="BACKGROUND"
      title={title}
      shape="rect"
      stage={{ width: 560, height: 200 }}
      note="背景按 2.8:1 横幅显示。拖动照片或调整数值选择展示区域，保存后立即生效。"
      saveLabel="保存背景"
      maxSourceBytes={25 * 1024 * 1024}
      encode={encodeCover}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}

/** Team crest: square crop, transparency kept (WebP with alpha). */
export function CrestCropper({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: (dataUrl: string) => Promise<void>
}) {
  return (
    <ImageCropDialog
      kicker="CREST"
      title="更换队徽"
      shape="rect"
      stage={{ width: 240, height: 240 }}
      note="队徽按正方形显示，透明背景会保留。拖动图片或调整数值，保存后立即生效。"
      saveLabel="保存队徽"
      encode={encodeCrest}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}

function ImageCropDialog({
  kicker,
  title,
  shape,
  stage: requestedStage,
  note,
  saveLabel,
  maxSourceBytes = 12 * 1024 * 1024,
  encode,
  onCancel,
  onConfirm,
}: {
  kicker: string
  title: string
  shape: Shape
  stage: Frame
  note: string
  saveLabel: string
  maxSourceBytes?: number
  encode: Encoder
  onCancel: () => void
  onConfirm: (dataUrl: string) => Promise<void>
}) {
  const [source, setSource] = useState<string | null>(null),
    [dimensions, setDimensions] = useState<Frame>({ width: 1, height: 1 })
  const [zoom, setZoomRaw] = useState(1),
    [offsetX, setOffsetXRaw] = useState(0),
    [offsetY, setOffsetYRaw] = useState(0),
    [saving, setSaving] = useState(false),
    [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null)
  const desktop = useDesktop()
  // Phones keep the original 240px-wide stage; wide frames shrink to fit it.
  const stage = useMemo(() => {
    if (desktop || requestedStage.width <= 300) return requestedStage
    return { width: 300, height: Math.round((300 * requestedStage.height) / requestedStage.width) }
  }, [desktop, requestedStage])
  useOverlayFocus(true, '.avatar-cropper-panel', () => {
    if (!saving) onCancel()
  })
  useEffect(() => () => inputRef.current?.remove(), [])
  // Dropping an image anywhere on the window while this dialog is open picks it, like 选择照片.
  const [fileOver, setFileOver] = useState(false)
  const chooseRef = useRef<(file: File | undefined) => Promise<void>>(async () => {})
  useEffect(() => {
    let depth = 0
    const hasFiles = (event: DragEvent) =>
      Boolean(event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files'))
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth += 1
      setFileOver(true)
    }
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setFileOver(false)
    }
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth = 0
      setFileOver(false)
      const files = Array.from(event.dataTransfer?.files ?? [])
      void chooseRef.current(files.find((file) => SOURCE_TYPES.includes(file.type)) ?? files[0])
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  const limits = useCallback(
    (z: number) => {
      const scale = Math.max(stage.width / dimensions.width, stage.height / dimensions.height) * z
      return {
        x: Math.max(0, Math.floor((dimensions.width * scale - stage.width) / 2)),
        y: Math.max(0, Math.floor((dimensions.height * scale - stage.height) / 2)),
      }
    },
    [dimensions.height, dimensions.width, stage.height, stage.width],
  )
  const limit = limits(zoom)
  const setOffsetX = (value: number) => setOffsetXRaw(clamp(Math.round(value), -limit.x, limit.x))
  const setOffsetY = (value: number) => setOffsetYRaw(clamp(Math.round(value), -limit.y, limit.y))
  const setZoom = (value: number) => {
    const next = clamp(Math.round(value * 100) / 100, ZOOM_MIN, ZOOM_MAX)
    const nextLimit = limits(next)
    setZoomRaw(next)
    // Zooming out shrinks the movable range; keep the frame inside the photo.
    setOffsetXRaw((x) => clamp(x, -nextLimit.x, nextLimit.x))
    setOffsetYRaw((y) => clamp(y, -nextLimit.y, nextLimit.y))
  }
  const plan = useMemo(
    () => placement(stage, dimensions, zoom, offsetX, offsetY),
    [dimensions, offsetX, offsetY, stage, zoom],
  )

  const choose = async (file: File | undefined) => {
    if (!file) return
    try {
      if (!SOURCE_TYPES.includes(file.type)) throw new Error('请选择 JPEG、PNG 或 WebP 照片')
      if (file.size > maxSourceBytes)
        throw new Error(`请选择小于${Math.round(maxSourceBytes / 1024 / 1024)} MiB的照片`)
      const path = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('无法读取照片'))
        reader.readAsDataURL(file)
      })
      const image = await loadImage(path)
      if (image.naturalWidth < 64 || image.naturalHeight < 64)
        throw new Error(
          `图片太小（${image.naturalWidth}×${image.naturalHeight}），请选择至少 64×64 像素的照片`,
        )
      setSource(path)
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight })
      setZoomRaw(1)
      setOffsetXRaw(0)
      setOffsetYRaw(0)
    } catch (error) {
      void Taro.showToast({
        title: error instanceof Error ? error.message : '照片读取失败',
        icon: 'none',
      })
    }
  }
  chooseRef.current = (file) => (saving ? Promise.resolve() : choose(file))
  const chooseFile = () => {
    inputRef.current?.remove()
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = SOURCE_TYPES.join(',')
    input.style.setProperty('display', 'none', 'important')
    inputRef.current = input
    const clean = () => {
      input.remove()
      if (inputRef.current === input) inputRef.current = null
    }
    input.addEventListener(
      'change',
      () => {
        void choose(input.files?.[0])
        clean()
      },
      { once: true },
    )
    input.addEventListener('cancel', clean, { once: true })
    document.body.append(input)
    input.click()
  }
  const save = async () => {
    if (!source || saving) return
    setSaving(true)
    try {
      await onConfirm(await encode(await loadImage(source), plan))
    } catch (error) {
      void Taro.showToast({
        title: error instanceof Error ? error.message : '保存失败，请重试',
        icon: 'none',
      })
    } finally {
      setSaving(false)
    }
  }
  const close = () => {
    if (!saving) onCancel()
  }
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={`avatar-cropper-modal${fileOver ? ' is-file-over' : ''}`}
    >
      <div className="avatar-cropper-backdrop" onClick={close} />
      <section
        className={`avatar-cropper-panel${shape === 'rect' ? ' avatar-cropper-panel--cover' : ''}`}
      >
        <header className="avatar-cropper-heading">
          <div>
            <span className="avatar-cropper-kicker">{kicker}</span>
            <h2 className="avatar-cropper-title">{title}</h2>
          </div>
          <IconButton
            icon="close"
            aria-label={`关闭${title}`}
            className="avatar-cropper-close"
            onClick={close}
          >
            ×
          </IconButton>
        </header>
        <div
          className={`avatar-cropper-stage${source ? ' avatar-cropper-stage--ready' : ''}${
            dragging ? ' is-dragging' : ''
          }`}
          style={{ width: `${stage.width}px`, height: `${stage.height}px`, touchAction: 'none' }}
          onPointerDown={(event) => {
            if (!source || event.button !== 0) return
            event.preventDefault()
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              ox: offsetX,
              oy: offsetY,
            }
            setDragging(true)
          }}
          onPointerMove={(event) => {
            const start = drag.current
            if (!start || start.id !== event.pointerId) return
            // The page may be CSS-zoomed; convert screen pixels back into stage pixels.
            const ratio = event.currentTarget.getBoundingClientRect().width / stage.width || 1
            setOffsetX(start.ox + (event.clientX - start.x) / ratio)
            setOffsetY(start.oy + (event.clientY - start.y) / ratio)
          }}
          onPointerUp={() => {
            drag.current = null
            setDragging(false)
          }}
          onPointerCancel={() => {
            drag.current = null
            setDragging(false)
          }}
        >
          {source ? (
            <img
              className="avatar-cropper-image"
              src={source}
              alt={`${title}预览`}
              draggable={false}
              style={{
                width: `${plan.width}px`,
                height: `${plan.height}px`,
                left: `${plan.left}px`,
                top: `${plan.top}px`,
              }}
            />
          ) : (
            <span className="avatar-cropper-placeholder">选择一张喜欢的照片</span>
          )}
          <div className={shape === 'circle' ? 'avatar-cropper-circle' : 'avatar-cropper-frame'} />
        </div>
        <button
          type="button"
          className="button button--outline avatar-cropper-choose"
          onClick={chooseFile}
          disabled={saving}
        >
          {source ? '重新选择' : '选择照片'}
        </button>
        {source && (
          <div className="avatar-cropper-controls">
            <CropControl
              label="缩放"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={0.01}
              value={zoom}
              unit="×"
              digits={2}
              withInput={desktop}
              onChange={setZoom}
            />
            <CropControl
              label="水平"
              min={-limit.x}
              max={limit.x}
              step={1}
              value={offsetX}
              unit="px"
              digits={0}
              withInput={desktop}
              onChange={setOffsetX}
            />
            <CropControl
              label="垂直"
              min={-limit.y}
              max={limit.y}
              step={1}
              value={offsetY}
              unit="px"
              digits={0}
              withInput={desktop}
              onChange={setOffsetY}
            />
          </div>
        )}
        <p className="avatar-cropper-note">{note}</p>
        <div className="avatar-cropper-actions">
          <button
            type="button"
            className="button button--outline"
            disabled={saving}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={!source || saving}
            onClick={() => void save()}
          >
            {saving ? '保存中…' : saveLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

/** Slider + numeric field, bound to the same value both ways. */
function CropControl({
  label,
  min,
  max,
  step,
  value,
  unit,
  digits,
  withInput,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  unit: string
  digits: number
  withInput: boolean
  onChange: (value: number) => void
}) {
  const formatted = value.toFixed(digits)
  const [draft, setDraft] = useState(formatted)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    // Follow outside changes (slider, drag, clamping) unless the field holds a partial entry
    // that already means the current value (e.g. "1." while typing "1.5").
    setDraft((current) => {
      if (!editing) return formatted
      const parsed = Number(current)
      return current.trim() && Number.isFinite(parsed) && parsed === Number(formatted)
        ? current
        : formatted
    })
  }, [formatted])
  useEffect(() => {
    if (!editing) setDraft(formatted)
  }, [editing])
  const commit = (text: string) => {
    const parsed = Number(text.replace(/[^\d.+-]/g, ''))
    if (text.trim() && Number.isFinite(parsed)) onChange(parsed)
  }
  const locked = min === max
  return (
    <div className={`avatar-cropper-control${withInput ? ' avatar-cropper-control--field' : ''}`}>
      <span className="avatar-cropper-control-label">{label}</span>
      <input
        type="range"
        className="avatar-cropper-slider"
        style={
          {
            '--xq-range-fill': `${locked ? 0 : ((value - min) / (max - min)) * 100}%`,
          } as CSSProperties
        }
        aria-label={label}
        min={min}
        max={max}
        value={value}
        step={step}
        disabled={locked}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {withInput ? (
        <span className={`avatar-cropper-number${locked ? ' is-locked' : ''}`}>
          <input
            className="avatar-cropper-number__input"
            type="text"
            inputMode="decimal"
            aria-label={`${label}数值（${unit}）`}
            value={draft}
            disabled={locked}
            onFocus={(event) => {
              setEditing(true)
              event.currentTarget.select()
            }}
            onBlur={() => {
              commit(draft)
              setEditing(false)
            }}
            onChange={(event) => {
              setDraft(event.target.value)
              commit(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commit(draft)
                setEditing(false)
                event.currentTarget.blur()
              } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault()
                const delta = (event.key === 'ArrowUp' ? 1 : -1) * step * (event.shiftKey ? 10 : 1)
                const next = clamp(value + delta, min, max)
                onChange(next)
                setDraft(next.toFixed(digits))
              }
            }}
          />
          <i className="avatar-cropper-number__unit" aria-hidden="true">
            {unit}
          </i>
        </span>
      ) : null}
    </div>
  )
}

function useDesktop() {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 721px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 721px)')
    const update = () => setDesktop(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return desktop
}

function placement(
  stage: Frame,
  image: Frame,
  zoom: number,
  offsetX: number,
  offsetY: number,
): DrawPlan {
  const scale = Math.max(stage.width / image.width, stage.height / image.height) * zoom
  const width = image.width * scale
  const height = image.height * scale
  return {
    stage,
    scale,
    width,
    height,
    left: (stage.width - width) / 2 + offsetX,
    top: (stage.height - height) / 2 + offsetY,
  }
}

function render(image: HTMLImageElement, plan: DrawPlan, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器无法创建图片画布')
  const k = width / plan.stage.width
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, plan.left * k, plan.top * k, plan.width * k, plan.height * k)
  return canvas
}

async function encodeAvatar(image: HTMLImageElement, plan: DrawPlan): Promise<string> {
  for (const edge of [512, 448, 384, 320]) {
    const canvas = render(image, plan, edge, edge)
    for (const quality of [0.88, 0.78, 0.68, 0.58]) {
      const dataUrl = canvas.toDataURL('image/webp', quality)
      if (estimateBytes(dataUrl) <= 72 * 1024) return dataUrl
    }
  }
  throw new Error('这张照片压缩后仍过大，请换一张图片')
}

async function encodeCrest(image: HTMLImageElement, plan: DrawPlan): Promise<string> {
  for (const edge of [640, 512, 384]) {
    const canvas = render(image, plan, edge, edge)
    for (const quality of [0.92, 0.84, 0.74]) {
      let dataUrl = canvas.toDataURL('image/webp', quality)
      if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/png')
      if (estimateBytes(dataUrl) <= 900 * 1024) return dataUrl
    }
  }
  throw new Error('这张队徽压缩后仍过大，请换一张图片')
}

async function encodeCover(image: HTMLImageElement, plan: DrawPlan): Promise<string> {
  // Output at the photo's own resolution for the chosen region (never above 2240×800).
  const region = plan.stage.width / plan.scale
  const ratio = plan.stage.width / plan.stage.height
  const width = Math.round(clamp(region, 1120, 2240))
  const canvas = render(image, plan, width, Math.round(width / ratio))
  for (const quality of [0.86, 0.78, 0.68, 0.58]) {
    let dataUrl = canvas.toDataURL('image/webp', quality)
    if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (estimateBytes(dataUrl) <= 1.8 * 1024 * 1024) return dataUrl
  }
  throw new Error('图片压缩后仍然过大，请换一张')
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法读取所选照片'))
    image.src = source
  })
}

function estimateBytes(dataUrl: string): number {
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.ceil((payload.length * 3) / 4)
}
