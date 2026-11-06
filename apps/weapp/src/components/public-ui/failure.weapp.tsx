import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { NativeLoadingRing } from '../native-loading/index.weapp'
import { useNativePanelVisible } from '../native-navigation/panel-context.weapp'
import { switchNativeSection } from '../../features/native-navigation/index.weapp'
import { nativeFailureHint } from './failure.logic.weapp'
import './failure.weapp.scss'

export function NativeFailureState({
  title,
  description,
  onRetry,
}: {
  title: string
  description?: string
  onRetry?: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const hint = nativeFailureHint(description || title)
  const running = useRef(false),
    lastAttempt = useRef(Date.now()),
    latest = useRef(onRetry),
    visible = useNativePanelVisible(),
    wasVisible = useRef(visible)
  latest.current = onRetry
  const retry = async (automatic: boolean) => {
    const action = latest.current
    if (!action || running.current) return
    /* Automatic attempts stay quiet and are spaced out so show/online events never stack up. */
    if (automatic && (hint.kind !== 'network' || Date.now() - lastAttempt.current < 4000)) return
    running.current = true
    lastAttempt.current = Date.now()
    setBusy(true)
    try {
      await action()
    } catch {
      if (!automatic) void Taro.showToast({ title: '暂时还没恢复，请稍后再试', icon: 'none' })
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  /* A failed page tries once more when it is shown again or the network comes back. */
  useDidShow(() => void retry(true))
  useEffect(() => {
    if (visible && !wasVisible.current) void retry(true)
    wasVisible.current = visible
  }, [visible])
  useEffect(() => {
    const online = (result: { isConnected: boolean }) => {
      if (result.isConnected) void retry(true)
    }
    Taro.onNetworkStatusChange(online)
    return () => Taro.offNetworkStatusChange(online)
  }, [])
  const help = async () => {
    if (hint.kind === 'session') {
      await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    if (hint.kind === 'permission' || hint.kind === 'missing' || hint.kind === 'service') {
      await switchNativeSection('home')
      return
    }
    let content = '可以尝试切换 Wi-Fi 或移动网络后重新加载。'
    try {
      const network = await Taro.getNetworkType()
      content =
        network.networkType === 'none'
          ? '当前没有连接网络，请连上 Wi-Fi 或移动网络后重试。'
          : '已连接网络。如仍无法加载，可以切换网络或稍后重试。'
    } catch {
      /* Keep the available local/default value when device services are unavailable. */
    }
    await Taro.showModal({
      title: '连接提示',
      content,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#315f3d',
    })
  }
  return (
    <View className="native-failure" role="alert">
      <View className="native-failure__illustration" aria-hidden>
        <View className="native-failure__orbit" />
        <NativeLoadingRing animated={busy} />
        <View className="native-failure__pause">!</View>
      </View>
      <Text className="native-failure__title">{title}</Text>
      <Text className="native-failure__subtitle">
        {hint.kind === 'network'
          ? '暂时没能接上，点一下再试试'
          : hint.kind === 'session'
            ? '重新确认登录状态后即可继续'
            : '可以重试，或先返回其他页面'}
      </Text>
      <View className="native-failure__actions">
        {onRetry && hint.kind !== 'missing' && (
          <Button
            className="native-failure__retry"
            hoverClass="is-pressed"
            disabled={busy}
            onClick={() => void retry(false)}
          >
            <View className={`native-failure__refresh${busy ? ' is-spinning' : ''}`} />
            {busy ? '正在重试' : '重新加载'}
          </Button>
        )}
        <Button
          className="native-failure__help"
          hoverClass="is-pressed"
          onClick={() => void help()}
        >
          {hint.kind === 'session'
            ? '重新登录'
            : hint.kind === 'permission' || hint.kind === 'missing' || hint.kind === 'service'
              ? '返回首页'
              : '检查网络'}
        </Button>
      </View>
      <View className="native-failure__reason">
        <Text>{hint.cause}</Text>
        {description && <Text className="native-failure__detail">{description}</Text>}
      </View>
    </View>
  )
}
