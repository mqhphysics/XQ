import { useLayoutEffect, useRef, type RefObject } from 'react'
import { prefersReducedMotion } from './spring.h5'
import './interactions.h5.scss'

/** Selected tag scales in CSS. Immediate neighbours nudge aside, then spring back. */
export function useExpandingTagShift(
  containerRef: RefObject<HTMLElement | null>,
  selected: string,
) {
  const previous = useRef(selected)
  useLayoutEffect(() => {
    const root = containerRef.current
    const prev = previous.current
    previous.current = selected
    if (!root || prev === selected || prefersReducedMotion()) return
    const tags = [...root.querySelectorAll<HTMLElement>('[data-xq-tag]')]
    const index = tags.findIndex((tag) => tag.dataset.xqTag === selected)
    if (index < 0) return
    for (const tag of tags) tag.getAnimations().forEach((animation) => animation.cancel())
    const neighbours = [tags[index - 1], tags[index + 1]].filter(
      (tag): tag is HTMLElement => Boolean(tag),
    )
    for (const tag of neighbours) {
      const direction = tag === tags[index - 1] ? -1 : 1
      tag.animate(
        [
          { transform: 'translateX(0px)' },
          { transform: `translateX(${direction * 7}px)`, offset: 0.42 },
          { transform: 'translateX(0px)' },
        ],
        { duration: 280, easing: 'cubic-bezier(0.22, 0.85, 0.28, 1)' },
      )
    }
  }, [containerRef, selected])
}

export function ExpandingTags({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className = '',
}: {
  label: string
  value: string
  options: Array<{ id: string; label: string }>
  onChange: (id: string) => void
  disabled?: boolean
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useExpandingTagShift(ref, value)
  return (
    <div
      ref={ref}
      className={`xq-tags ${className}`.trim()}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => {
        const selected = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            data-xq-tag={option.id}
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            className={selected ? 'is-active' : ''}
            onClick={() => {
              if (option.id !== value) onChange(option.id)
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
