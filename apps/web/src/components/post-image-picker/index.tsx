import { Button, Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useRef, useState } from 'react'

import './index.scss'

export async function preparePostImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('请选择 JPEG、PNG 或 WebP 照片')
  if (file.size > 10 * 1024 * 1024) throw new Error('请选择小于 10 MiB 的照片')
  const bitmap = await createImageBitmap(file)
  try {
    if (bitmap.width < 64 || bitmap.height < 64 || bitmap.width * bitmap.height > 24_000_000)
      throw new Error('照片尺寸过小或过大，请换一张照片')
    const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * ratio)
    canvas.height = Math.round(bitmap.height * ratio)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('暂时无法读取照片，请重新选择')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.84, 0.72, 0.6]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      if (dataUrl.length <= 1_400_000) return dataUrl
    }
    throw new Error('照片压缩后仍过大，请换一张较小的照片')
  } finally {
    bitmap.close()
  }
}

export function PostImagePicker({
  value,
  disabled,
  onChange,
  onProcessingChange,
}: {
  value: string | null
  disabled: boolean
  onChange: (value: string | null) => void
  onProcessingChange: (processing: boolean) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (Taro.getEnv() !== Taro.ENV_TYPE.WEB) return null
  return (
    <View className="post-image-picker">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="选择动态照片"
        className="post-image-picker__file"
        disabled={disabled || picking}
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!file) return
          setPicking(true)
          onProcessingChange(true)
          setError(null)
          try {
            onChange(await preparePostImage(file))
          } catch (issue) {
            setError(issue instanceof Error ? issue.message : '照片读取失败')
          } finally {
            setPicking(false)
            onProcessingChange(false)
          }
        }}
      />
      <View className="post-image-picker__controls">
        <Button disabled={disabled || picking} onClick={() => input.current?.click()}>
          {picking ? '正在处理照片…' : value ? '更换照片' : '添加照片'}
        </Button>
        <Text>可选一张照片，也可以只发文字</Text>
        {value && (
          <Button disabled={disabled || picking} onClick={() => onChange(null)}>
            移除
          </Button>
        )}
      </View>
      {value && (
        <Image
          aria-label="待发布照片预览"
          className="post-image-picker__preview"
          mode="aspectFit"
          src={value}
        />
      )}
      {error && (
        <View role="alert" className="post-image-picker__error">
          <Text>{error}</Text>
        </View>
      )}
    </View>
  )
}
