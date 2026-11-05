import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'

type Size = { windowWidth: number; windowHeight: number }

/** Only the dialog layout follows the keyboard. Its backdrop remains fixed to all four edges. */
export function useDialogViewport(initial: Size) {
  const [height, setHeight] = useState(initial.windowHeight)
  useEffect(() => {
    let full = { ...initial },
      current = { ...initial },
      keyboard = 0
    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    let hideTimer: ReturnType<typeof setTimeout> | undefined
    const publish = () =>
      setHeight(Math.max(1, Math.min(current.windowHeight, full.windowHeight - keyboard)))
    const resize = (event: unknown) => {
      const info = Taro.getWindowInfo()
      const payload = event as ({ size?: Partial<Size> } & Partial<Size>) | null
      const size = payload?.size || payload
      const next = {
        windowWidth: size?.windowWidth || info.windowWidth,
        windowHeight: size?.windowHeight || info.windowHeight,
      }
      if (next.windowWidth !== current.windowWidth) {
        // Retain Android's resize mode across rotation; overlay keyboards need no extra height.
        const resizedByKeyboard = current.windowHeight < full.windowHeight
        full = { ...next, windowHeight: next.windowHeight + (resizedByKeyboard ? keyboard : 0) }
      }
      current = next
      clearTimeout(resizeTimer)
      if (!keyboard) {
        // A resize can precede the keyboard event. Do not shrink the full-height baseline twice.
        resizeTimer = setTimeout(() => {
          full = { ...current }
          publish()
        }, 120)
      }
      publish()
    }
    const changed = (event: { height: number; duration?: number }) => {
      clearTimeout(hideTimer)
      clearTimeout(resizeTimer)
      if (event.height > 0) {
        keyboard = event.height
        publish()
      } else {
        // Moving between inputs can briefly emit zero; wait for the keyboard to settle.
        hideTimer = setTimeout(
          () => {
            keyboard = 0
            current = {
              ...current,
              windowHeight: Math.max(current.windowHeight, full.windowHeight),
            }
            full = { ...current }
            publish()
          },
          Math.max(120, event.duration || 0),
        )
      }
    }
    Taro.onWindowResize(resize)
    Taro.onKeyboardHeightChange(changed)
    return () => {
      clearTimeout(resizeTimer)
      clearTimeout(hideTimer)
      Taro.offWindowResize(resize)
      Taro.offKeyboardHeightChange(changed)
      void Taro.hideKeyboard().catch(() => {})
    }
  }, [])
  return height
}
