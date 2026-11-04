import Taro, { useDidShow } from '@tarojs/taro'
import { createContext, useEffect, useRef, useState } from 'react'
export const NativeAuthKeyboardContext = createContext<{
  focus: (id: string) => void
  blur: (id: string) => void
} | null>(null)
export function useAuthKeyboard() {
  const [height, setHeight] = useState(0),
    [editing, setEditing] = useState(false),
    [target, setTarget] = useState('')
  const focused = useRef(''),
    lastHeight = useRef(0),
    currentHeight = useRef(0),
    blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    zeroTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const reveal = (id: string) =>
    Taro.nextTick(() => {
      if (focused.current !== id || typeof Taro.createSelectorQuery !== 'function') return
      let field: { top: number; bottom: number } | null = null,
        viewport: { top: number; bottom: number } | null = null
      const query = Taro.createSelectorQuery()
      query.select('#' + id).boundingClientRect((value) => {
        field = value as typeof field
      })
      query.select('.native-login__scroll').boundingClientRect((value) => {
        viewport = value as typeof viewport
      })
      query.exec(() => {
        if (focused.current !== id || !field || !viewport) return
        if (field.top < viewport.top + 8 || field.bottom > viewport.bottom - 8) {
          setTarget('')
          Taro.nextTick(() => {
            if (focused.current === id) setTarget(id)
          })
        }
      })
    })
  const focus = (id: string) => {
    if (blurTimer.current) clearTimeout(blurTimer.current)
    focused.current = id
    setEditing(true)
    setTarget('')
    reveal(id)
  }
  const blur = (id: string) => {
    if (focused.current !== id) return
    focused.current = ''
    if (blurTimer.current) clearTimeout(blurTimer.current)
    blurTimer.current = setTimeout(() => {
      if (!focused.current) {
        setEditing(false)
        setTarget('')
        if (!currentHeight.current) lastHeight.current = 0
      }
    }, 180)
  }
  useEffect(() => {
    const changed = (event: { height: number }) => {
      if (zeroTimer.current) clearTimeout(zeroTimer.current)
      if (event.height > 0) {
        currentHeight.current = event.height
        lastHeight.current = event.height
        setHeight(event.height)
        if (focused.current) {
          setTarget('')
          reveal(focused.current)
        }
      } else
        zeroTimer.current = setTimeout(() => {
          currentHeight.current = 0
          setHeight(0)
          if (!focused.current) {
            setEditing(false)
            lastHeight.current = 0
          }
        }, 120)
    }
    Taro.onKeyboardHeightChange(changed)
    return () => {
      Taro.offKeyboardHeightChange(changed)
      if (zeroTimer.current) clearTimeout(zeroTimer.current)
      if (blurTimer.current) clearTimeout(blurTimer.current)
    }
  }, [])
  useDidShow(() => {
    focused.current = ''
    currentHeight.current = 0
    lastHeight.current = 0
    setHeight(0)
    setEditing(false)
    setTarget('')
  })
  return {
    height,
    effectiveHeight: height || (editing ? lastHeight.current : 0),
    compact: editing || height > 0,
    focused: focused.current,
    target,
    focus,
    blur,
  }
}
