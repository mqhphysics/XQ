import { Button, Switch, Text, View } from '@tarojs/components'
import { useState } from 'react'
import { NativeDialog } from './index.weapp'
import {
  defaultNativePreferences,
  saveNativePreferences,
  useNativePreferences,
} from './preferences.weapp'

export function NativeSettings({ onClose }: { onClose: () => void }) {
  const preferences = useNativePreferences()
  const [error, setError] = useState('')
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
    </NativeDialog>
  )
}
