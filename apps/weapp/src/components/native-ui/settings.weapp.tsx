import { Button, Switch, Text, View } from '@tarojs/components'
import { useEffect, useState } from 'react'
import {
  clearRebuildableCache,
  nativeGifCacheUsage,
} from '../../features/product/cache-maintenance.weapp'
import { hasPendingNativeEdits } from '../../features/native-navigation/leave-guard.weapp'
import Taro from '@tarojs/taro'
import { NativePrivacyNotice } from './privacy.weapp'
import { ReportModal } from '../report-modal/index.weapp'
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
  const [privacy, setPrivacy] = useState(false),
    [deletion, setDeletion] = useState(false)
  const [diagnostics, setDiagnostics] = useState('')
  const fpsMeter = useNativeFpsMeter()
  const [cacheBytes, setCacheBytes] = useState<number | null>(null),
    [clearing, setClearing] = useState(false)
  useEffect(() => {
    let active = true
    void nativeGifCacheUsage()
      .then((value) => {
        if (active) setCacheBytes(value.bytes)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  const clearCache = async () => {
    if (
      clearing ||
      !(
        await Taro.showModal({
          title: '清理可重建缓存',
          content: '清理比赛GIF及读取缓存并返回首页。登录、设置、阵容和比赛录入草稿会保留。',
          confirmText: '清理缓存',
        })
      ).confirm
    )
      return
    if (hasPendingNativeEdits()) {
      setError('请先保存正在编辑的内容，再清理缓存')
      return
    }
    setClearing(true)
    try {
      await clearRebuildableCache()
      onClose()
      await Taro.reLaunch({ url: '/pages/index/index' })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '清理未完成，请重试')
    } finally {
      setClearing(false)
    }
  }
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
        disabled={clearing}
        loading={clearing}
        onClick={() => void clearCache()}
      >
        清理可重建缓存{cacheBytes === null ? '' : ` · GIF ${(cacheBytes / 1048576).toFixed(1)} MB`}
      </Button>
      <Button className="native-menu-row" onClick={() => setPrivacy(true)}>
        个人信息与隐私说明
      </Button>
      <Button className="native-menu-row" onClick={() => setDeletion(true)}>
        申请注销账号／删除个人信息
      </Button>
      {privacy && <NativePrivacyNotice onClose={() => setPrivacy(false)} />}
      {deletion && (
        <ReportModal
          targetType="FEEDBACK"
          title="账号注销与删除申请"
          initialReason="账号注销与个人信息删除申请"
          onClose={() => setDeletion(false)}
        />
      )}
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
