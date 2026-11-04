import { Button, Switch, Text, View } from '@tarojs/components'
import { useState } from 'react'
import Taro from '@tarojs/taro'
import { gettingStartedEvent } from '../../features/getting-started/repository.weapp'
import { nativeWideWindow } from '../../features/native-navigation/viewport.logic.weapp'
import { NativeDialog } from './index.weapp'
import { setNativeFpsMeter, useNativeFpsMeter } from './fps-meter.weapp'
import {
  defaultNativePreferences,
  saveNativePreferences,
  useNativePreferences,
} from './preferences.weapp'

export function NativeSettings({ onClose }: { onClose: () => void }) {
  const preferences = useNativePreferences()
  const [error, setError] = useState('')
  const [diagnostics, setDiagnostics] = useState('')
  const fpsMeter = useNativeFpsMeter()
  /* Hidden: long-press the version to read the real window size when a wide screen looks wrong. */
  const showDiagnostics = () => {
    if (diagnostics) return setDiagnostics('')
    const info = Taro.getWindowInfo()
    let sdk = ''
    try {
      sdk = Taro.getAppBaseInfo().SDKVersion ?? ''
    } catch {
      /* Older base libraries without getAppBaseInfo. */
    }
    setDiagnostics(
      `${info.windowWidth}×${info.windowHeight} · 屏幕 ${info.screenWidth}×${info.screenHeight} · DPR ${info.pixelRatio} · SDK ${sdk || '未知'} · ${nativeWideWindow(info) ? '宽屏布局' : '手机布局'}`,
    )
  }
  const save = (next: typeof preferences) => {
    try {
      saveNativePreferences(next)
      setError('')
    } catch {
      setError('设置保存失败，请重试')
    }
  }
  return (
    <NativeDialog
      title="设置"
      onClose={onClose}
      footer={
        <Button className="native-button" onClick={() => save(defaultNativePreferences)}>
          恢复默认
        </Button>
      }
    >
      {(
        [
          ['reduceMotion', '减少动画'],
          ['largeText', '增大动态文字'],
          ['autoplayGif', '自动播放比赛 GIF'],
        ] as const
      ).map(([key, label]) => (
        <View className="native-menu-row" key={key}>
          <Text>{label}</Text>
          <View className="native-menu-row__value">
            <Switch
              color="#356747"
              checked={preferences[key]}
              onChange={(event) => save({ ...preferences, [key]: event.detail.value })}
            />
          </View>
        </View>
      ))}
      {error && <Text className="native-error">{error}</Text>}
      <Button
        className="native-menu-row"
        onClick={() => {
          onClose()
          Taro.eventCenter.trigger(gettingStartedEvent, 'guide')
        }}
      >
        使用引导
      </Button>
      <View className="native-settings-about" onLongPress={showDiagnostics}>
        <Text>晓球{process.env.TARO_APP_VERSION ? ` v${process.env.TARO_APP_VERSION}` : ''}</Text>
        {diagnostics && <Text className="native-settings-about__diagnostics">{diagnostics}</Text>}
      </View>
      {diagnostics && (
        <View className="native-menu-row">
          <Text>显示帧率（FPS）</Text>
          <View className="native-menu-row__value">
            <Switch
              color="#356747"
              checked={fpsMeter}
              onChange={(event) => setNativeFpsMeter(event.detail.value)}
            />
          </View>
        </View>
      )}
    </NativeDialog>
  )
}
