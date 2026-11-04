import { RootPortal, Script, View } from '@tarojs/components'
import type { CommonEventFunction } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import './fps-meter.weapp.scss'

/* Module exported by ./fps-meter.wxs; CompileMode binds it in the view layer (never called from JS). */
declare const fpsMeterWxs: { start: CommonEventFunction }

const storageKey = 'xiaoqiu:fps-meter',
  changeEvent = 'xiaoqiu:fps-meter'

export function readNativeFpsMeter() {
  try {
    return Taro.getStorageSync(storageKey) === 1
  } catch {
    return false
  }
}

export function setNativeFpsMeter(on: boolean) {
  try {
    Taro.setStorageSync(storageKey, on ? 1 : 0)
  } catch {
    /* Still toggles for this session. */
  }
  Taro.eventCenter.trigger(changeEvent, on)
}

export function useNativeFpsMeter() {
  const [on, setOn] = useState(readNativeFpsMeter)
  useEffect(() => {
    const changed = (next: boolean) => setOn(next)
    Taro.eventCenter.on(changeEvent, changed)
    return () => {
      Taro.eventCenter.off(changeEvent, changed)
    }
  }, [])
  return on
}

/**
 * Floating frame-rate readout (rolling 1 s average and the lowest half-second over the last
 * 10 s), toggled in 设置 → long-press the version → 显示帧率. Frames are counted on the render
 * layer (./fps-meter.wxs), so the number is what the phone actually painted.
 */
export function NativeFpsMeter() {
  const on = useNativeFpsMeter()
  return (
    <RootPortal>
      <View compileMode className="native-fps-meter-host">
        <Script src="./fps-meter.wxs" module="fpsMeterWxs" />
        {/* The WXS handler has to sit on a child of the CompileMode root to bind in the view layer. */}
        <View
          className={on ? 'native-fps-meter is-on' : 'native-fps-meter'}
          onAnimationStart={fpsMeterWxs.start}
        />
      </View>
    </RootPortal>
  )
}
