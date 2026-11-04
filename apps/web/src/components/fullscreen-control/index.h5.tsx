import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'

export function FullscreenSetting() {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement))
  const supported = Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen)

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      await Taro.showToast({ title: '无法切换全屏，请检查浏览器设置', icon: 'none' })
    }
  }

  return (
    <View className="settings-dialog__row">
      <View className="settings-dialog__row-copy">
        <Text className="settings-dialog__row-title">全屏显示</Text>
        <Text className="settings-dialog__row-description">
          {supported ? '让比赛内容铺满整个屏幕' : '当前浏览器不支持网页全屏'}
        </Text>
      </View>
      <Button
        aria-label={isFullscreen ? '退出全屏' : '进入全屏'}
        aria-pressed={isFullscreen}
        className="settings-dialog__action"
        disabled={!supported}
        onClick={() => void toggleFullscreen()}
      >
        {isFullscreen ? '退出全屏' : '进入全屏'}
      </Button>
    </View>
  )
}
