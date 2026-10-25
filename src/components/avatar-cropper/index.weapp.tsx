import { Button, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useRef, useState } from 'react'
import { NativeDialog } from '../native-ui/index.weapp'
export function AvatarCropper({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: (dataUrl: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const lock = useRef(false)
  const choose = async () => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const chosen = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album'],
      })
      if (!chosen.tempFilePaths[0]) return
      const image = await Taro.compressImage({ src: chosen.tempFilePaths[0], quality: 80 })
      const base64 = Taro.getFileSystemManager().readFileSync(
        image.tempFilePath,
        'base64',
      ) as string
      await onConfirm(`data:image/jpeg;base64,${base64}`)
    } catch (reason) {
      if (!String((reason as { errMsg?: string })?.errMsg).includes('cancel'))
        setError(reason instanceof Error ? reason.message : '图片上传失败')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <NativeDialog
      title="更换头像"
      compact
      busy={busy}
      onClose={onCancel}
      footer={
        <Button
          className="native-button native-button--primary"
          loading={busy}
          onClick={() => void choose()}
        >
          选择照片
        </Button>
      }
    >
      <Text className="native-note">从相册选择一张头像。</Text>
      {error && <Text className="native-error">{error}</Text>}
    </NativeDialog>
  )
}
