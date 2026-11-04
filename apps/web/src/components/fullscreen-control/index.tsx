import { Text, View } from '@tarojs/components'

export function FullscreenSetting() {
  return (
    <View className="settings-dialog__row settings-dialog__row--disabled">
      <View className="settings-dialog__row-copy">
        <Text className="settings-dialog__row-title">全屏显示</Text>
        <Text className="settings-dialog__row-description">仅网页端支持全屏显示</Text>
      </View>
      <Text className="settings-dialog__row-status">不可用</Text>
    </View>
  )
}
