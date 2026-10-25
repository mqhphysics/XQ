import { Button, Canvas, Image, Slider, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useId, useState } from 'react'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import { request, createClientActionId } from '../../features/product/product.repository'
import type { MediaAsset } from '../../features/managed-media/repository.h5'

export function NativeTeamCoverEditor({
  teamId,
  onClose,
  onSaved,
}: {
  teamId: string
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const canvasId = `team-cover-${useId().replace(/[^a-z0-9]/gi, '')}`
  const [image, setImage] = useState<{ path: string; width: number; height: number } | null>(null)
  const [focus, setFocus] = useState(50),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const choose = async () => {
    try {
      const selected = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      const info = await Taro.getImageInfo({ src: selected.tempFilePaths[0]! })
      setImage({ path: info.path, width: info.width, height: info.height })
      setFocus(50)
      setError('')
    } catch (issue) {
      if (!String((issue as { errMsg?: string }).errMsg).includes('cancel'))
        setError('图片读取失败，请重选')
    }
  }
  const width = image ? Math.min(image.width, image.height * 2.8) : 1
  const height = width / 2.8
  const x = image ? ((image.width - width) * focus) / 100 : 0
  const y = image ? ((image.height - height) * focus) / 100 : 0
  const save = async () => {
    if (!image || busy) return
    setBusy(true)
    setError('')
    try {
      const context = Taro.createCanvasContext(canvasId)
      context.drawImage(image.path, x, y, width, height, 0, 0, 1120, 400)
      await new Promise<void>((resolve) => context.draw(false, () => resolve()))
      const exported = await Taro.canvasToTempFilePath({
        canvasId,
        width: 1120,
        height: 400,
        destWidth: 1120,
        destHeight: 400,
        fileType: 'jpg',
        quality: 0.88,
      })
      const dataUrl = await new Promise<string>((resolve, reject) =>
        Taro.getFileSystemManager().readFile({
          filePath: exported.tempFilePath,
          encoding: 'base64',
          success: (result) => resolve(`data:image/jpeg;base64,${String(result.data)}`),
          fail: reject,
        }),
      )
      await request<MediaAsset>('/media-assets', {
        method: 'POST',
        data: {
          purpose: 'TEAM_BACKGROUND',
          targetId: teamId,
          clientSubmissionId: createClientActionId('team-cover'),
          dataUrl,
        },
      })
      await onSaved()
      onClose()
      void Taro.showToast({ title: '球队背景已更新', icon: 'success' })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '背景保存失败，请重试')
    } finally {
      setBusy(false)
    }
  }
  return (
    <NativeDialog
      title="更换球队背景"
      busy={busy}
      unsavedChanges={!!image}
      onClose={onClose}
      footer={
        <Button
          className="native-button native-button--primary"
          disabled={!image || busy}
          loading={busy}
          onClick={() => void save()}
        >
          保存背景
        </Button>
      }
    >
      <Text className="native-note">与网站共用球队背景，保存后同步显示。</Text>
      <Button className="native-button" disabled={busy} onClick={() => void choose()}>
        {image ? '重新选图' : '从相册选择图片'}
      </Button>
      {image && (
        <>
          <View className="native-cover-crop-preview">
            <Image
              mode="scaleToFill"
              src={image.path}
              style={`width:${(image.width / width) * 100}%;height:${(image.height / height) * 100}%;left:${(-x / width) * 100}%;top:${(-y / height) * 100}%;`}
            />
          </View>
          <Text className="native-label">
            调整{image.width / image.height > 2.8 ? '左右' : '上下'}取景
          </Text>
          <Slider
            min={0}
            max={100}
            value={focus}
            activeColor="#376646"
            disabled={busy}
            onChanging={(e) => setFocus(e.detail.value)}
            onChange={(e) => setFocus(e.detail.value)}
          />
        </>
      )}
      {error && <Text className="native-error">{error}</Text>}
      <Canvas
        canvasId={canvasId}
        style="position:fixed;left:-3000px;top:0;width:1120px;height:400px;"
      />
    </NativeDialog>
  )
}
