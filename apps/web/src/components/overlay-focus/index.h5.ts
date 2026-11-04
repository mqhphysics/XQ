import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface OverlayEntry {
  panel: HTMLElement | null
}
const overlays: OverlayEntry[] = []
let unlockedOverflow = ''

export function useOverlayFocus(
  enabled: boolean,
  panelSelector: string,
  onClose: () => void,
): void {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!enabled) return
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = document.querySelector<HTMLElement>(panelSelector)
    const entry = { panel }
    if (overlays.length === 0) unlockedOverflow = document.body.style.overflow
    overlays.push(entry)
    const focusFirst = () => {
      panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus()
    }
    const timer = window.setTimeout(focusFirst, 0)
    const onKeyDown = (event: KeyboardEvent) => {
      // A profile and the message drawer can remain interactive together. Route
      // keyboard handling to the panel with focus, falling back to the newest.
      const active =
        overlays
          .slice()
          .reverse()
          .find((overlay) => overlay.panel?.contains(document.activeElement)) ?? overlays.at(-1)
      if (active !== entry || event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null,
      )
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      const index = overlays.indexOf(entry)
      if (index !== -1) overlays.splice(index, 1)
      if (overlays.length === 0) document.body.style.overflow = unlockedOverflow
      document.removeEventListener('keydown', onKeyDown)
      if (
        previousFocus?.isConnected &&
        previousFocus.offsetParent !== null &&
        (overlays.length === 0 ||
          overlays.some((overlay) => overlay.panel?.contains(previousFocus)))
      )
        previousFocus.focus()
      else overlays.at(-1)?.panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus()
    }
  }, [enabled, panelSelector])
}
