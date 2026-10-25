import { PageContainer, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { nativeBack } from '../../features/native-navigation/index.weapp'
export function NativeBackGuard() {
  const [show, setShow] = useState(true)
  const alive = useRef(true),
    suppress = useRef(false),
    processing = useRef(false),
    until = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rearm = () => {
    if (!alive.current) return
    until.current = 0
    if (timer.current) clearTimeout(timer.current)
    setShow(true)
  }
  const handle = async (native: boolean) => {
    if (processing.current) return
    processing.current = true
    const result = await nativeBack()
    processing.current = false
    if (!alive.current) return
    if (result !== 'exit') {
      if (native) Taro.nextTick(rearm)
      return
    }
    if (Date.now() < until.current) {
      // Android's second native Back passes through while the container is closed.
      // Programmatic exit remains subject to WeChat's user-gesture permission.
      if (!native)
        await Taro.exitMiniProgram().catch(() => {
          void Taro.showToast({ title: '请再使用系统返回退出', icon: 'none' })
        })
      return
    }
    until.current = Date.now() + 2000
    void Taro.showToast({ title: '再次返回将退出小程序', icon: 'none', duration: 2000 })
    if (!native) suppress.current = true
    setShow(false)
    timer.current = setTimeout(rearm, 2000)
  }
  const latest = useRef(handle)
  latest.current = handle
  useEffect(() => {
    alive.current = true
    const requested = () => {
      void latest.current(false)
    }
    const activity = () => {
      if (!processing.current) rearm()
    }
    Taro.eventCenter.on('xiaoqiu:native-request-back', requested)
    Taro.eventCenter.on('xiaoqiu:native-history', activity)
    Taro.eventCenter.on('xiaoqiu:native-main-section', activity)
    return () => {
      alive.current = false
      if (timer.current) clearTimeout(timer.current)
      Taro.eventCenter.off('xiaoqiu:native-request-back', requested)
      Taro.eventCenter.off('xiaoqiu:native-history', activity)
      Taro.eventCenter.off('xiaoqiu:native-main-section', activity)
    }
  }, [])
  useDidShow(rearm)
  return (
    <PageContainer
      show={show}
      overlay={false}
      duration={0}
      customStyle="height:0;min-height:0;background:transparent;pointer-events:none;"
      onAfterLeave={() => {
        if (!alive.current) return
        if (suppress.current) {
          suppress.current = false
          return
        }
        setShow(false)
        void latest.current(true)
      }}
    >
      <View />
    </PageContainer>
  )
}
