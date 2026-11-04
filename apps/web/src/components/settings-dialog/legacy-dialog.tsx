import { Button, Text, View } from '@tarojs/components'

import { FullscreenSetting } from '../fullscreen-control'
import { useOverlayFocus } from '../overlay-focus'
import { IconButton } from '../icon-button'

import './index.scss'

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  useOverlayFocus(true, '.settings-dialog__panel', onClose)

  return (
    <View aria-modal role="dialog" aria-label="设置" className="settings-dialog">
      <View className="settings-dialog__backdrop" onClick={onClose} />
      <View className="settings-dialog__panel">
        <View className="settings-dialog__header">
          <View>
            <Text className="settings-dialog__eyebrow">PREFERENCES</Text>
            <Text className="settings-dialog__title">设置</Text>
            <Text className="settings-dialog__intro">调整你的晓球浏览体验</Text>
          </View>
          <IconButton icon="close" aria-label="关闭设置" className="settings-dialog__close" onClick={onClose}>
            ×
          </IconButton>
        </View>

        <View className="settings-dialog__body">
          <Text className="settings-dialog__section-title">通用</Text>
          <View className="settings-dialog__group">
            <FullscreenSetting />
            <View className="settings-dialog__row settings-dialog__row--disabled">
              <View className="settings-dialog__row-copy">
                <Text className="settings-dialog__row-title">外观主题</Text>
                <Text className="settings-dialog__row-description">选择适合你的页面外观</Text>
              </View>
              <Button className="settings-dialog__action" disabled>即将开放</Button>
            </View>
            <View className="settings-dialog__row settings-dialog__row--disabled">
              <View className="settings-dialog__row-copy">
                <Text className="settings-dialog__row-title">消息通知</Text>
                <Text className="settings-dialog__row-description">管理比赛与社区提醒</Text>
              </View>
              <Button className="settings-dialog__action" disabled>即将开放</Button>
            </View>
          </View>
        </View>

        <View className="settings-dialog__footer">
          <Text>晓球 V1.0.0</Text>
        </View>
      </View>
    </View>
  )
}
