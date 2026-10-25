import { Button, Image, PageMeta, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import {
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react'
import { nativeBack, useNativeShell } from '../../features/native-navigation/index.weapp'
import { keyboardViewport } from '../../features/native-social/interaction.logic.weapp'
import { nativeHeaderMetrics } from '../public-shell/native-header-metrics.weapp'
import backIcon from '../../assets/post-icons/chevron-left.svg'
import { NativeDetailEntryContext } from '../../features/native-navigation/detail-context.weapp'
import { NativeBackGuard } from '../native-navigation/native-back-guard.weapp'
import './social.weapp.scss'

export function reportNativeKeyboardHeight(height: number) {
  Taro.eventCenter.trigger('xiaoqiu:native-keyboard-height', height)
}

export function useNativeKeyboardViewport() {
  const info = Taro.getWindowInfo()
  const baseline = useRef(info.windowHeight)
  const [height, setHeight] = useState(info.windowHeight),
    [keyboard, setKeyboard] = useState(0)
  useEffect(() => {
    const resized = () => {
      const current = Taro.getWindowInfo().windowHeight
      baseline.current = Math.max(baseline.current, current)
      setHeight(current)
    }
    const changed = (event: { height: number }) => setKeyboard(event.height)
    const reported = (value: number) => setKeyboard(value)
    Taro.onWindowResize(resized)
    Taro.onKeyboardHeightChange(changed)
    Taro.eventCenter.on('xiaoqiu:native-keyboard-height', reported)
    return () => {
      Taro.offWindowResize(resized)
      Taro.offKeyboardHeightChange(changed)
      Taro.eventCenter.off('xiaoqiu:native-keyboard-height', reported)
    }
  }, [])
  return { height: keyboardViewport(baseline.current, height, keyboard), keyboard }
}
export function NativeSocialPage({
  title,
  children,
  footer,
  onBack,
  action,
}: PropsWithChildren<{
  title: string
  footer?: ReactNode
  onBack?: () => void
  action?: ReactNode
}>) {
  const { height, keyboard } = useNativeKeyboardViewport()
  const entry = useContext(NativeDetailEntryContext)
  const metrics = nativeHeaderMetrics()
  const { touchHandlers } = useNativeShell('home', true)
  return (
    <>
      <PageMeta pageStyle="height:100%;overflow:hidden;" />
      <View
        className={`native-social-page${keyboard ? ' is-keyboard' : ''}`}
        style={`height:${height}px;padding-top:${metrics.top}px;`}
        {...touchHandlers}
      >
        <View
          className="native-social-page__head"
          style={`min-height:${metrics.rowHeight + 12}px;`}
        >
          <Button
            aria-label="返回"
            className="native-social-page__back"
            onClick={() => (onBack ? onBack() : void nativeBack())}
          >
            <Image src={backIcon} mode="aspectFit" />
          </Button>
          <View className="native-social-page__title">{title}</View>
        </View>
        {action && <View className="native-social-page__action">{action}</View>}
        <View className="native-social-page__body">{children}</View>
        {footer && <View className="native-social-page__footer">{footer}</View>}
      </View>
      {!entry && <NativeBackGuard />}
    </>
  )
}
