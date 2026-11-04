import { prefersReducedMotion } from './spring.h5'

/** Arc toward the right edge, then collapse the row. Reduced motion removes at once. */
export function playCurvedLeave(
  element: HTMLElement,
  options?: { collapse?: boolean },
): Promise<void> {
  if (prefersReducedMotion() || typeof element.animate !== 'function') return Promise.resolve()
  const collapse = options?.collapse !== false
  element.style.overflow = 'hidden'
  const arc = element.animate(
    [
      { transform: 'translate3d(0, 0, 0) rotate(0deg)', opacity: 1, offset: 0 },
      { transform: 'translate3d(32px, -18px, 0) rotate(7deg)', opacity: 1, offset: 0.45 },
      { transform: 'translate3d(108px, 24px, 0) rotate(12deg)', opacity: 0, offset: 1 },
    ],
    { duration: 220, easing: 'cubic-bezier(0.33, 0, 0.2, 1)', fill: 'forwards' },
  )
  return arc.finished
    .catch(() => undefined)
    .then(() => {
      if (!collapse) return undefined
      const shrink = element.animate(
        [
          {
            maxHeight: `${element.offsetHeight}px`,
            marginTop: '0px',
            marginBottom: '0px',
            paddingTop: '0px',
            paddingBottom: '0px',
          },
          {
            maxHeight: '0px',
            marginTop: '0px',
            marginBottom: '0px',
            paddingTop: '0px',
            paddingBottom: '0px',
          },
        ],
        { duration: 80, easing: 'ease', fill: 'forwards' },
      )
      return shrink.finished.then(() => undefined)
    })
}
