import { View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react'
import {
  canDragNativeDetail,
  claimNativeSwipe,
  nativeTouchPoint,
} from '../../features/native-navigation/index.weapp'
import { indicatorPosition } from '../../features/native-navigation/history.logic.weapp'
import './content-pager.weapp.scss'

const layoutEvent = 'xiaoqiu:native-content-layout'
export const measureNativeContent = () => Taro.eventCenter.trigger(layoutEvent)
type Handle = { position: (value: number, duration: number) => void }
const ContentTrack = forwardRef<Handle, PropsWithChildren<{ initial: number }>>(
  function ContentTrack({ initial, children }, ref) {
    const [frame, setFrame] = useState({ position: initial, duration: 0 })
    useImperativeHandle(
      ref,
      () => ({ position: (position, duration) => setFrame({ position, duration }) }),
      [],
    )
    return (
      <View
        className="native-content-track"
        style={`transform:translate3d(${-frame.position * 100}%,0,0);transition-duration:${frame.duration}ms;`}
      >
        {children}
      </View>
    )
  },
)
export function NativeContentPager({
  index,
  onSelect,
  pages,
}: {
  index: number
  onSelect: (index: number) => void | boolean | Promise<void | boolean>
  pages: ReactNode[]
}) {
  const id = `native-content-${useId().replace(/[^a-z0-9]/gi, '')}`
  const track = useRef<Handle>(null),
    current = useRef(index),
    width = useRef(Taro.getWindowInfo().windowWidth),
    heights = useRef<Array<number | undefined>>([]),
    alive = useRef(true)
  current.current = index
  const [height, setHeight] = useState<number | null>(null),
    [dragging, setDragging] = useState(false)
  const motion = useRef({ from: index, to: index, at: 0, duration: 0 })
  const present = () => indicatorPosition(motion.current, Date.now())
  const updateHeight = (position: number) => {
    const low = Math.max(0, Math.min(pages.length - 1, Math.floor(position))),
      high = Math.min(pages.length - 1, low + 1),
      fraction = Math.max(0, Math.min(1, position - low))
    const from = heights.current[low],
      to = heights.current[high] || from
    setHeight(from && to ? Math.max(1, from + (to - from) * fraction) : null)
  }
  const animate = (to: number) => {
    to = Math.max(0, Math.min(pages.length - 1, Math.round(to)))
    const from = present()
    const next = { from, to, at: Date.now(), duration: 210 }
    motion.current = next
    track.current?.position(from, 0)
    setDragging(false)
    updateHeight(to)
    Taro.nextTick(() => {
      if (alive.current && motion.current === next)
        track.current?.position(to, Math.max(0, next.at + 210 - Date.now()))
    })
  }
  const gesture = useRef<{
    point: NonNullable<ReturnType<typeof nativeTouchPoint>>
    position: number
    horizontal: boolean
    vertical: boolean
    lastX: number
    lastAt: number
    velocity: number
  } | null>(null)
  useDidHide(() => {
    gesture.current = null
    animate(current.current)
  })
  useDidShow(() => {
    gesture.current = null
    animate(current.current)
  })
  useEffect(() => {
    animate(index)
  }, [index])
  useEffect(() => {
    alive.current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const measure = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(
        () =>
          Taro.nextTick(() => {
            if (!alive.current) return
            const query = Taro.createSelectorQuery()
            query.select(`#${id}`).boundingClientRect((rect) => {
              width.current = (rect as { width?: number })?.width || width.current
            })
            pages.forEach((_, i) =>
              query.select(`#${id}-${i}`).boundingClientRect((rect) => {
                const measured = (rect as { height?: number })?.height
                heights.current[i] = measured && measured > 0 ? Math.ceil(measured) : undefined
              }),
            )
            query.exec(() => {
              if (alive.current) updateHeight(current.current)
            })
          }),
        40,
      )
    }
    measure()
    Taro.eventCenter.on(layoutEvent, measure)
    Taro.onWindowResize(measure)
    return () => {
      alive.current = false
      if (timer) clearTimeout(timer)
      Taro.eventCenter.off(layoutEvent, measure)
      Taro.offWindowResize(measure)
    }
  }, [pages, id])
  const rendered = useMemo(
    () =>
      pages.map((page, i) => (
        <View
          key={i}
          className={`native-content-slide${i === index ? ' is-active' : ''}`}
          style={`left:${i * 100}%;`}
        >
          <View id={`${id}-${i}`}>{page}</View>
        </View>
      )),
    [pages, id, index],
  )
  return (
    <View
      id={id}
      className="native-content-viewport"
      style={`height:${height === null ? 'auto' : `${height}px`};min-height:160px;transition-duration:${dragging ? 0 : 160}ms;`}
      catchMove={dragging}
      onClick={() => measureNativeContent()}
      onTouchStart={(event) => {
        const p = nativeTouchPoint(event),
          screen = Taro.getWindowInfo().windowWidth
        const edge = p && (p.x <= 28 || p.x >= screen - 28)
        claimNativeSwipe(event, edge ? 0 : index, edge ? 1 : pages.length)
        gesture.current =
          p && canDragNativeDetail() && p.x > 28 && p.x < screen - 28
            ? {
                point: p,
                position: present(),
                horizontal: false,
                vertical: false,
                lastX: p.x,
                lastAt: p.at,
                velocity: 0,
              }
            : null
      }}
      onTouchMove={(event) => {
        const state = gesture.current,
          p = nativeTouchPoint(event)
        if (!state || !p || state.vertical || !canDragNativeDetail()) return
        const dx = p.x - state.point.x,
          dy = p.y - state.point.y
        if (!state.horizontal) {
          if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
            state.vertical = true
            return
          }
          if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.5) return
          const next = index + (dx < 0 ? 1 : -1)
          if (next < 0 || next >= pages.length) return
          state.horizontal = true
          state.position = present()
          setDragging(true)
        }
        event.stopPropagation()
        const raw = state.position - dx / width.current,
          last = pages.length - 1,
          value = raw < 0 ? raw * 0.14 : raw > last ? last + (raw - last) * 0.14 : raw
        state.velocity = -(p.x - state.lastX) / Math.max(1, p.at - state.lastAt)
        state.lastX = p.x
        state.lastAt = p.at
        motion.current = { from: value, to: value, at: Date.now(), duration: 0 }
        track.current?.position(value, 0)
        updateHeight(value)
      }}
      onTouchEnd={(event) => {
        const state = gesture.current,
          p = nativeTouchPoint(event)
        gesture.current = null
        if (!state?.horizontal) return
        event.stopPropagation()
        const velocity = (p?.at ?? Date.now()) - state.lastAt < 100 ? state.velocity : 0,
          projected = present() + (velocity * 140) / width.current
        const target = Math.max(
          0,
          Math.min(
            pages.length - 1,
            Math.max(index - 1, Math.min(index + 1, Math.round(projected))),
          ),
        )
        if (target === index) animate(index)
        else {
          const accepted = onSelect(target)
          if (accepted instanceof Promise)
            void accepted
              .then((value) => {
                animate(value === false ? current.current : target)
              })
              .catch(() => animate(current.current))
          else animate(accepted === false ? current.current : target)
        }
      }}
      onTouchCancel={() => {
        animate(current.current)
        gesture.current = null
      }}
    >
      <ContentTrack ref={track} initial={index}>
        {rendered}
      </ContentTrack>
    </View>
  )
}
