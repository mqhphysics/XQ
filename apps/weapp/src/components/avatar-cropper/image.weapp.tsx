import { Button, Canvas, Image, Slider, Text, View, type ITouchEvent } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useId, useRef, useState } from 'react'
import { NativeDialog } from '../native-ui/index.weapp'
import { imageCrop, type CropPosition } from './crop.logic'
import './image.weapp.scss'
import { exportNativeCrop } from './export.weapp'

export function NativeImageCropper({
  title,
  ratio,
  output,
  onCancel,
  onConfirm,
}: {
  title: string
  ratio: number
  output: { width: number; height: number }
  onCancel: () => void
  onConfirm: (dataUrl: string) => Promise<void>
}) {
  const canvasId = `profile-crop-${useId().replace(/[^a-z0-9]/gi, '')}`
  const [image, setImage] = useState<{ path: string; width: number; height: number } | null>(null)
  const [position, setPosition] = useState<CropPosition>({ zoom: 1, x: 0.5, y: 0.5 })
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const lock = useRef(false)
  const gesture = useRef<{ x: number; y: number; position: CropPosition; frame: number } | null>(
    null,
  )
  const crop = image ? imageCrop(image, ratio, position) : null
  const choose = async () => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setProgress('正在准备图片…')
    try {
      const choice = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      const path = choice.tempFilePaths[0]
      if (!path) return
      const info = await Taro.getImageInfo({ src: path })
      setImage({ path: info.path, width: info.width, height: info.height })
      setPosition({ zoom: 1, x: 0.5, y: 0.5 })
    } catch (issue) {
      if (!/cancel/i.test(String((issue as { errMsg?: string })?.errMsg)))
        setError(issue instanceof Error ? issue.message : '图片读取失败，请重新选择')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const save = async () => {
    if (!image || !crop || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setProgress('正在处理图片…')
    try {
      const dataUrl = await exportNativeCrop(canvasId, image.path, crop, output)
      setProgress('正在上传并保存…')
      await onConfirm(dataUrl)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '图片保存失败，请重试')
    } finally {
      lock.current = false
      setBusy(false)
      setProgress('')
    }
  }
  return (
    <NativeDialog
      title={title}
      busy={busy}
      unsavedChanges={!!image}
      onClose={onCancel}
      footer={
        <Button
          className="native-button native-button--primary native-image-cropper__save"
          disabled={!image || busy}
          loading={busy}
          onClick={() => void save()}
        >
          保存
        </Button>
      }
    >
      <Button
        className="native-button native-image-cropper__choose"
        disabled={busy}
        onClick={() => void choose()}
      >
        {image ? '重新选择图片' : '从相册或相机选择'}
      </Button>
      {image && crop ? (
        <>
          <View
            className={`native-image-cropper__viewport${ratio === 1 ? ' is-avatar' : ''}`}
            style={`height:0;padding-top:${100 / ratio}%;`}
            catchMove
            onTouchStart={(event) => {
              event.stopPropagation()
              const touch = (event as ITouchEvent).touches[0]
              if (!touch || busy) return
              const start = {
                x: touch.clientX,
                y: touch.clientY,
                position: { ...position },
                frame: Math.max(1, Taro.getWindowInfo().windowWidth - 96),
              }
              gesture.current = start
              Taro.createSelectorQuery()
                .select('.native-image-cropper__viewport')
                .boundingClientRect((rect) => {
                  if (gesture.current === start && rect)
                    start.frame = (rect as { width: number }).width
                })
                .exec()
            }}
            onTouchMove={(event) => {
              event.stopPropagation()
              const start = gesture.current,
                touch = (event as ITouchEvent).touches[0]
              if (!start || !touch || busy) return
              const scale = start.frame / crop.width
              setPosition({
                ...start.position,
                x: Math.max(
                  0,
                  Math.min(
                    1,
                    start.position.x -
                      (touch.clientX - start.x) / scale / Math.max(1, image.width - crop.width),
                  ),
                ),
                y: Math.max(
                  0,
                  Math.min(
                    1,
                    start.position.y -
                      (touch.clientY - start.y) / scale / Math.max(1, image.height - crop.height),
                  ),
                ),
              })
            }}
            onTouchEnd={() => {
              gesture.current = null
            }}
            onTouchCancel={() => {
              gesture.current = null
            }}
          >
            <Image
              src={image.path}
              mode="scaleToFill"
              style={`width:${(image.width / crop.width) * 100}%;height:${(image.height / crop.height) * 100}%;left:${(-crop.x / crop.width) * 100}%;top:${(-crop.y / crop.height) * 100}%;`}
            />
            <View className="native-image-cropper__guides" />
          </View>
          <Text className="native-note">
            拖动照片调整取景，滑动下方调整大小
            {ratio === 1 ? '。头像按正方形保存。' : '。背景按2.8:1横图保存。'}
          </Text>
          <Slider
            min={100}
            max={300}
            value={Math.round(position.zoom * 100)}
            activeColor="#376646"
            disabled={busy}
            onChanging={(event) =>
              setPosition((value) => ({ ...value, zoom: event.detail.value / 100 }))
            }
            onChange={(event) =>
              setPosition((value) => ({ ...value, zoom: event.detail.value / 100 }))
            }
          />
        </>
      ) : (
        <Text className="native-note">先选一张照片，预览并调整后再保存。</Text>
      )}
      {error && <Text className="native-error">{error}</Text>}
      {busy && progress && <Text className="native-note">{progress}</Text>}
      <Canvas
        id={canvasId}
        type="2d"
        canvasId={canvasId}
        style="position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;"
      />
    </NativeDialog>
  )
}
