import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { prefersReducedMotion } from './spring.h5'
import './interactions.h5.scss'

function lineHeight(element: HTMLElement): number {
  const style = getComputedStyle(element)
  const parsed = parseFloat(style.lineHeight)
  if (Number.isFinite(parsed)) return parsed
  const font = parseFloat(style.fontSize)
  return (Number.isFinite(font) ? font : 14) * 1.7
}

/**
 * Collapses overflowing copy and animates the height open. Short text stays as it is,
 * with no toggle, so surrounding layout does not move.
 */
export function TextDisclosure({
  lines,
  className = '',
  children,
}: {
  lines: number
  className?: string
  children: ReactNode
}) {
  const bodyId = useId()
  const body = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const [height, setHeight] = useState<number | 'auto'>('auto')

  useLayoutEffect(() => {
    const element = body.current
    if (!element) return
    const collapsed = Math.round(lineHeight(element) * lines)
    const previous = element.style.height
    element.style.height = 'auto'
    const full = element.scrollHeight
    element.style.height = previous
    const nextOverflow = full > collapsed + 1
    setOverflows((current) => (current === nextOverflow ? current : nextOverflow))
    if (!open) {
      const nextHeight = nextOverflow ? collapsed : full
      setHeight((current) => (current === nextHeight ? current : nextHeight))
    }
  }, [children, lines, open])

  const toggle = () => {
    const element = body.current
    if (!element) return
    const collapsed = Math.round(lineHeight(element) * lines)
    const full = element.scrollHeight
    if (prefersReducedMotion()) {
      setOpen((current) => !current)
      setHeight(open ? collapsed : 'auto')
      return
    }
    if (!open) {
      setHeight(collapsed)
      setOpen(true)
      window.requestAnimationFrame(() => setHeight(full))
      return
    }
    setHeight(full)
    setOpen(false)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setHeight(collapsed))
    })
  }

  return (
    <div className={`xq-disclose ${open ? 'is-open' : ''} ${className}`.trim()}>
      <div
        id={bodyId}
        ref={body}
        className="xq-disclose__body"
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
        onTransitionEnd={(event) => {
          if (event.propertyName !== 'height' || event.target !== event.currentTarget) return
          if (open) setHeight('auto')
        }}
      >
        {children}
      </div>
      {overflows ? (
        <button
          type="button"
          className="xq-disclose__toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
        >
          {open ? '收起' : '展开'}
          <svg className="xq-disclose__chevron" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 9l6 6 6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}
    </div>
  )
}
