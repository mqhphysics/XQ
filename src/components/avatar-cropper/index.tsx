import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'

import './index.scss'

export function AvatarCropper({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: (dataUrl: string) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const choose = async () => {
    setSaving(true)
    try {
      const chosen = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album'],
      })
      const path = chosen.tempFilePaths[0]
      if (!path) return
      const compressed = await Taro.compressImage({ src: path, quality: 70 })
      const base64 = Taro.getFileSystemManager().readFileSync(
        compressed.tempFilePath,
        'base64',
      ) as string
      await onConfirm(`data:image/jpeg;base64,${base64}`)
    } finally {
      setSaving(false)
    }
  }
  return (
    <View className="avatar-cropper-modal">
      <View className="avatar-cropper-backdrop" onClick={onCancel} />
      <View className="avatar-cropper-panel">
        <Text className="avatar-cropper-title">更换头像</Text>
        <Text className="avatar-cropper-note">网站端提供精细裁剪；小程序端本轮先压缩上传。</Text>
        <View className="avatar-cropper-actions">
          <Button className="button button--outline" onClick={onCancel}>
            取消
          </Button>
          <Button className="button button--primary" loading={saving} onClick={() => void choose()}>
            选择照片
          </Button>
        </View>
      </View>
    </View>
  )
}
