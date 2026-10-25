import { RootPortal, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import { nativeTouchPoint } from '../../features/native-navigation/index.weapp'
import { drawerRelease, drawerSpring } from '../../features/native-social/interaction.logic.weapp'
import { useNativePreferences } from '../native-ui/preferences.weapp'

export interface NativeSwipeDrawerHandle {
  close: () => void
}
export const NativeSwipeDrawer = forwardRef<
  NativeSwipeDrawerHandle,
  PropsWithChildren<{ onClose: () => void; onInterrupt: () => void; top: number }>
>(function NativeSwipeDrawer({ children, onClose, onInterrupt, top }, ref) {
  const width = Taro.getWindowInfo().windowWidth * 0.77
  const { reduceMotion } = useNativePreferences()
  const [x, setX] = useState(-width)
  const position = useRef(-width),
    velocity = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbacks = useRef({ onClose, onInterrupt })
  callbacks.current = { onClose, onInterrupt }
  const stop = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  const render = (next: number) => {
    position.current = next
    setX(next)
  }
  const animate = (target: number) => {
    stop()
    if (reduceMotion) {
      render(target)
      if (target < 0) Taro.nextTick(() => callbacks.current.onClose())
      return
    }
    const start = Date.now(),
      origin = position.current,
      initialVelocity = velocity.current
    const tick = () => {
      const frame = drawerSpring(origin, initialVelocity, target, (Date.now() - start) / 1000)
      velocity.current = frame.velocity
      const next = frame.position
      if (
        (target < 0 && next <= -width) ||
        (target === 0 && next >= 0) ||
        (Math.abs(next - target) < 0.5 && Math.abs(velocity.current) < 5)
      ) {
        render(target)
        velocity.current = 0
        timer.current = null
        if (target < 0) callbacks.current.onClose()
        return
      }
      render(next)
      timer.current = setTimeout(tick, 16)
    }
    timer.current = setTimeout(tick, 16)
  }
  useImperativeHandle(ref, () => ({ close: () => animate(-width) }))
  useEffect(() => {
    animate(0)
    return stop
  }, [])
  const gesture = useRef<{
    point: NonNullable<ReturnType<typeof nativeTouchPoint>>
    anchor: number
    last: number
    at: number
    horizontal: boolean
    vertical: boolean
  } | null>(null)
  return (
    <RootPortal>
      <View
        className="native-account-mask"
        catchMove
        style={`background:rgba(18,37,25,${Math.max(0, Math.min(1, 1 + x / width)) * 0.4});`}
        onClick={() => animate(-width)}
      >
        <View
          className="native-account-drawer"
          style={`width:${width}px;padding-top:${top}px;animation:none;transform:translate3d(${x}px,0,0);`}
          role="dialog"
          aria-label="个人侧栏"
          onClick={(event) => event.stopPropagation()}
          onTouchStart={(event) => {
            const point = nativeTouchPoint(event)
            if (!point) return
            stop()
            callbacks.current.onInterrupt()
            gesture.current = {
              point,
              anchor: position.current,
              last: point.x,
              at: point.at,
              horizontal: false,
              vertical: false,
            }
          }}
          onTouchMove={(event) => {
            const state = gesture.current,
              point = nativeTouchPoint(event)
            if (!state || !point || state.vertical) return
            const dx = point.x - state.point.x,
              dy = point.y - state.point.y
            if (!state.horizontal) {
              if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
                state.vertical = true
                if (position.current < -0.5) animate(0)
                return
              }
              if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.4) return
              state.horizontal = true
            }
            event.stopPropagation()
            velocity.current = ((point.x - state.last) / Math.max(1, point.at - state.at)) * 1000
            state.last = point.x
            state.at = point.at
            const raw = state.anchor + dx
            render(Math.max(-width, raw > 0 ? raw * 0.1 : raw))
          }}
          onTouchEnd={(event) => {
            const state = gesture.current,
              point = nativeTouchPoint(event)
            gesture.current = null
            if (!state?.horizontal) {
              if (position.current < -0.5) animate(0)
              return
            }
            event.stopPropagation()
            if (!point || point.at - state.at > 100) velocity.current = 0
            animate(drawerRelease(position.current, velocity.current, width))
          }}
          onTouchCancel={() => {
            gesture.current = null
            animate(0)
          }}
        >
          {children}
        </View>
      </View>
    </RootPortal>
  )
})
