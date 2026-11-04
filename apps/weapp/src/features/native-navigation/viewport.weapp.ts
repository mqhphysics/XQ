import Taro, { useDidShow, useResize } from '@tarojs/taro'
import { useEffect, useState } from 'react'
type WindowInfo = ReturnType<typeof Taro.getWindowInfo>
let current: WindowInfo | undefined
const listeners = new Set<() => void>()
export function readNativeViewport() {
  return current || (current = Taro.getWindowInfo())
}
function publish(value: WindowInfo) {
  const old = current
  current = value
  if (
    !old ||
    old.windowWidth !== value.windowWidth ||
    old.windowHeight !== value.windowHeight ||
    old.statusBarHeight !== value.statusBarHeight ||
    old.screenHeight !== value.screenHeight ||
    old.safeArea?.bottom !== value.safeArea?.bottom
  )
    for (const listener of listeners) listener()
  return value
}
export function refreshNativeViewport() {
  return publish(Taro.getWindowInfo())
}
const resized = (event: unknown) => {
  const info = Taro.getWindowInfo(),
    payload = event as {
      size?: { windowWidth?: number; windowHeight?: number }
      windowWidth?: number
      windowHeight?: number
    } | null,
    size = payload?.size || payload
  publish({
    ...info,
    windowWidth: size?.windowWidth || info.windowWidth,
    windowHeight: size?.windowHeight || info.windowHeight,
  })
}
export function useNativeViewport() {
  const [value, setValue] = useState(readNativeViewport)
  useEffect(() => {
    const update = () => setValue(readNativeViewport())
    if (!listeners.size) Taro.onWindowResize(resized)
    listeners.add(update)
    refreshNativeViewport()
    update()
    return () => {
      listeners.delete(update)
      if (!listeners.size) Taro.offWindowResize(resized)
    }
  }, [])
  /* Page-level resize (foldable opened/closed, Android split screen) as well as the app-level one. */
  useResize(() => {
    refreshNativeViewport()
    Taro.nextTick(() => {
      refreshNativeViewport()
    })
  })
  useDidShow(() => {
    refreshNativeViewport()
    Taro.nextTick(() => {
      refreshNativeViewport()
    })
  })
  return value
}
