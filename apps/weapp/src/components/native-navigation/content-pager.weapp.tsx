import { Swiper, SwiperItem, View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  nativeTouchPoint,
  useNestedNativeSwipe,
} from '../../features/native-navigation/index.weapp'

const layoutEvent = 'xiaoqiu:native-content-layout'
export const measureNativeContent = () => Taro.eventCenter.trigger(layoutEvent)
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
  const [displayed, setDisplayed] = useState(index)
  const [height, setHeight] = useState(160)
  const [edgeGesture, setEdgeGesture] = useState(false)
  const visited = useRef(new Set<number>())
  for (const target of [index - 1, index, index + 1])
    if (target >= 0 && target < pages.length) visited.current.add(target)
  const heights = useRef<number[]>([]),
    current = useRef(index),
    selection = useRef(0)
  current.current = index
  const alignHeight = (target: number) => setHeight(Math.max(160, heights.current[target] || 160))
  useEffect(() => {
    setDisplayed(index)
    alignHeight(index)
  }, [index])
  const reset = () => {
    selection.current++
    setDisplayed(current.current)
    alignHeight(current.current)
  }
  useDidHide(reset)
  useDidShow(reset)
  useEffect(() => {
    let alive = true,
      timer: ReturnType<typeof setTimeout> | undefined
    const measure = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(
        () =>
          Taro.nextTick(() => {
            if (!alive) return
            const query = Taro.createSelectorQuery()
            pages.forEach((_, i) => {
              if (Math.abs(i - current.current) > 1) return
              query.select(`#${id}-${i}`).boundingClientRect((rect) => {
                const value = (rect as { height?: number })?.height
                if (value && value > 0) heights.current[i] = Math.ceil(value)
              })
            })
            query.exec(() => {
              if (alive) alignHeight(current.current)
            })
          }),
        40,
      )
    }
    measure()
    Taro.eventCenter.on(layoutEvent, measure)
    Taro.onWindowResize(measure)
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
      Taro.eventCenter.off(layoutEvent, measure)
      Taro.offWindowResize(measure)
    }
  }, [pages, id])
  const select = async (target: number) => {
    const ticket = ++selection.current
    setDisplayed(target)
    alignHeight(target)
    try {
      const accepted = await onSelect(target)
      if (ticket === selection.current && accepted === false) reset()
    } catch {
      if (ticket === selection.current) reset()
    }
  }
  const gestures = useNestedNativeSwipe(index, pages.length, () => {}, true, true)
  return (
    <View
      className="native-content-viewport"
      onClick={measureNativeContent}
      {...gestures}
      onTouchStart={(event) => {
        const point = nativeTouchPoint(event),
          width = Taro.getWindowInfo().windowWidth
        setEdgeGesture(!!point && (point.x <= 28 || point.x >= width - 28))
        gestures.onTouchStart(event)
      }}
      onTouchEnd={(event) => {
        gestures.onTouchEnd(event)
        setEdgeGesture(false)
      }}
      onTouchCancel={() => {
        gestures.onTouchCancel()
        setEdgeGesture(false)
      }}
    >
      <Swiper
        className="native-content-swiper"
        current={displayed}
        duration={280}
        easingFunction="easeOutCubic"
        circular={false}
        disableTouch={edgeGesture}
        skipHiddenItemLayout={false}
        style={`height:${height}px;`}
        onChange={(event) => {
          if (event.detail.source === 'touch') void select(event.detail.current)
        }}
        onAnimationFinish={(event) => {
          if (event.detail.current === current.current) alignHeight(event.detail.current)
        }}
      >
        {pages.map((page, i) => (
          <SwiperItem key={i}>
            <View id={`${id}-${i}`} className="native-content-slide">
              {visited.current.has(i) ? page : null}
            </View>
          </SwiperItem>
        ))}
      </Swiper>
      <View className="native-content-edge native-content-edge--left" />
      <View className="native-content-edge native-content-edge--right" />
    </View>
  )
}
