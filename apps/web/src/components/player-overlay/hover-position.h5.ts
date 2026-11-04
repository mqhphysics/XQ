import { useLayoutEffect, useRef, useState } from 'react'

// Measure the rendered preview: estimated heights can cover the trigger and fire mouseleave.
export function useHoverPosition(anchor: HTMLElement) {
  const ref = useRef<HTMLElement>(null)
  const [position, setPosition] = useState({ left: 16, top: 16, width: 358, maxHeight: 500 })
  useLayoutEffect(() => {
    const update = () => {
      if (!ref.current || !anchor.isConnected) return
      const rect = anchor.getBoundingClientRect()
      const width = Math.min(358, window.innerWidth - 32)
      const above = Math.max(0, rect.top - 24)
      const below = Math.max(0, window.innerHeight - rect.bottom - 24)
      const height = ref.current.scrollHeight
      const useBelow = height <= below || below >= above
      const maxHeight = Math.max(80, useBelow ? below : above)
      const top = useBelow
        ? rect.bottom + 12
        : Math.max(12, rect.top - Math.min(height, maxHeight) - 12)
      const left = Math.max(16, Math.min(rect.left - 20, window.innerWidth - width - 16))
      setPosition((previous) =>
        previous.left === left &&
        previous.top === top &&
        previous.width === width &&
        previous.maxHeight === maxHeight
          ? previous
          : { left, top, width, maxHeight },
      )
    }
    update()
    const observer = new ResizeObserver(update)
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [anchor])
  return { ref, style: { ...position, overflowY: 'auto' as const } }
}
