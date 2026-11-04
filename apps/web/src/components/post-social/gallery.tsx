import { useEffect, useRef, useState } from 'react'
import { PostIcon } from './icons'

export function PostGallery({ images, label = '动态图片' }: { images: string[]; label?: string }) {
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const picture = useRef<HTMLImageElement>(null)
  const indicator = useRef<HTMLSpanElement>(null)
  const transform = useRef({ scale: 1, x: 0, y: 0 })
  const zoom = useRef<(scale: number) => void>(() => {})
  const drag = useRef<{
    x: number
    y: number
    originX: number
    originY: number
    pointerId: number
  } | null>(null)
  const paint = () => {
    const value = transform.current
    if (picture.current)
      picture.current.style.transform = `translate(${value.x}px, ${value.y}px) scale(${value.scale})`
    if (indicator.current) indicator.current.textContent = `${Math.round(value.scale * 100)}%`
    if (stage.current) stage.current.dataset.zoomed = String(value.scale > 1)
  }
  const clampPosition = () => {
    const box = stage.current
    if (!box) return
    const value = transform.current
    const maxX = (box.clientWidth * (value.scale - 1)) / 2
    const maxY = (box.clientHeight * (value.scale - 1)) / 2
    value.x = Math.min(maxX, Math.max(-maxX, value.x))
    value.y = Math.min(maxY, Math.max(-maxY, value.y))
  }
  useEffect(() => {
    transform.current = { scale: 1, x: 0, y: 0 }
    paint()
    const box = stage.current
    if (!box) return
    const changeScale = (scale: number, x = 0, y = 0) => {
      const value = transform.current
      const next = Math.min(5, Math.max(1, scale))
      const ratio = next / value.scale
      value.x = x - (x - value.x) * ratio
      value.y = y - (y - value.y) * ratio
      value.scale = next
      clampPosition()
      paint()
    }
    zoom.current = (scale) => changeScale(scale)
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const bounds = box.getBoundingClientRect()
      changeScale(
        transform.current.scale * Math.exp(-event.deltaY * 0.002),
        event.clientX - bounds.left - bounds.width / 2,
        event.clientY - bounds.top - bounds.height / 2,
      )
    }
    box.addEventListener('wheel', wheel, { passive: false })
    return () => box.removeEventListener('wheel', wheel)
  }, [index, images])
  const changeImage = (next: number) => {
    setIndex(next)
    setFailed(false)
  }
  return (
    <div className="post-gallery" role="region" aria-label={label}>
      <div
        className="post-gallery__stage"
        ref={stage}
        tabIndex={0}
        aria-label="图片查看器，滚轮缩放，方向键切换"
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' && index < images.length - 1) {
            event.preventDefault()
            changeImage(index + 1)
          }
          if (event.key === 'ArrowLeft' && index > 0) {
            event.preventDefault()
            changeImage(index - 1)
          }
          if (event.key === '0') zoom.current(1)
          if (event.key === '+' || event.key === '=') zoom.current(transform.current.scale * 1.2)
          if (event.key === '-') zoom.current(transform.current.scale / 1.2)
        }}
        onDoubleClick={() => zoom.current(transform.current.scale > 1 ? 1 : 2)}
        onPointerDown={(event) => {
          if (
            event.button !== 0 ||
            transform.current.scale <= 1 ||
            drag.current ||
            (event.target as HTMLElement).closest('button')
          )
            return
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            originX: transform.current.x,
            originY: transform.current.y,
            pointerId: event.pointerId,
          }
        }}
        onPointerMove={(event) => {
          if (!drag.current || drag.current.pointerId !== event.pointerId) return
          transform.current.x = drag.current.originX + event.clientX - drag.current.x
          transform.current.y = drag.current.originY + event.clientY - drag.current.y
          clampPosition()
          paint()
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
      >
        {failed ? (
          <div className="post-gallery__error" role="status">
            图片暂时无法加载
            <button type="button" onClick={() => setFailed(false)}>
              重新加载
            </button>
          </div>
        ) : (
          <img
            ref={picture}
            className="post-gallery__image"
            src={images[index]}
            alt={`${label} ${index + 1}`}
            draggable={false}
            onError={() => setFailed(true)}
          />
        )}
        {images.length > 1 && (
          <>
            <button
              type="button"
              className="post-gallery__arrow post-gallery__arrow--left"
              aria-label="上一张图片"
              disabled={index === 0}
              onClick={() => changeImage(index - 1)}
            >
              <PostIcon name="left" />
            </button>
            <button
              type="button"
              className="post-gallery__arrow post-gallery__arrow--right"
              aria-label="下一张图片"
              disabled={index === images.length - 1}
              onClick={() => changeImage(index + 1)}
            >
              <PostIcon name="right" />
            </button>
            <span className="post-gallery__count">
              {index + 1} / {images.length}
            </span>
          </>
        )}
        <div className="post-gallery__zoom">
          <button
            type="button"
            aria-label="缩小图片"
            onClick={() => zoom.current(transform.current.scale / 1.2)}
          >
            <PostIcon name="zoomOut" />
          </button>
          <span ref={indicator}>100%</span>
          <button
            type="button"
            aria-label="放大图片"
            onClick={() => zoom.current(transform.current.scale * 1.2)}
          >
            <PostIcon name="zoomIn" />
          </button>
          <button
            type="button"
            aria-label="重置缩放"
            title="重置缩放"
            onClick={() => zoom.current(1)}
          >
            <PostIcon name="reset" />
          </button>
        </div>
      </div>
      {images.length > 1 && (
        <div className="post-gallery__thumbnails" aria-label="选择图片">
          {images.map((source, imageIndex) => (
            <button
              type="button"
              key={imageIndex}
              aria-label={`查看第 ${imageIndex + 1} 张图片`}
              aria-pressed={imageIndex === index}
              onClick={() => changeImage(imageIndex)}
            >
              <img src={source} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
