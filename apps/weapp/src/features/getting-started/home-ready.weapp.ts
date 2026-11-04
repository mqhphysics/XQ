import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'

/**
 * The first-use welcome and guide wait until the home feed has real content, so no mask ever
 * covers an empty loading page. HomeScreen marks it after its first successful load.
 */
const event = 'xiaoqiu:native-home-ready'
let ready = false

export function markNativeHomeReady() {
  if (ready) return
  ready = true
  Taro.eventCenter.trigger(event)
}

export function useNativeHomeReady() {
  const [value, setValue] = useState(ready)
  useEffect(() => {
    if (ready) {
      setValue(true)
      return
    }
    const done = () => setValue(true)
    Taro.eventCenter.on(event, done)
    return () => {
      Taro.eventCenter.off(event, done)
    }
  }, [])
  return value
}

/** Scrolls the home feed so a guide target is on screen (handled by the main pager). */
export const nativeHomeScrollEvent = 'xiaoqiu:native-home-scroll'
