import { Button, Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { NativeImageCropper } from '../avatar-cropper/image.weapp'
import { NativePlayerFace } from './player-face.weapp'
import {
  createClientActionId,
  request,
  resolveMediaUrl,
} from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import type { MediaAsset } from '../../features/managed-media/repository.h5'
import './player-media.weapp.scss'

export function NativePlayerMedia({
  playerId,
  name,
  avatarUrl,
  coverUrl,
  onSaved,
  onEditingChange,
}: {
  playerId: string
  name: string
  avatarUrl?: string | null | undefined
  coverUrl?: string | null | undefined
  onSaved: () => Promise<void>
  onEditingChange: (editing: boolean) => void
}) {
  const [kind, setKind] = useState<'avatar' | 'cover' | null>(null)
  const [preview, setPreview] = useState({ avatar: avatarUrl, cover: coverUrl })
  const pending = useRef<{ data: string; key: string; kind: string } | null>(null)
  useEffect(() => setPreview({ avatar: avatarUrl, cover: coverUrl }), [avatarUrl, coverUrl])
  useEffect(() => {
    onEditingChange(!!kind)
    return () => onEditingChange(false)
  }, [kind, onEditingChange])
  return (
    <>
      <View className="native-player-media">
        <View className="native-player-media__item" id="native-guide-player-avatar">
          <Text>球员头像</Text>
          <View className="native-player-media__preview">
            <NativePlayerFace name={name} avatarUrl={preview.avatar || null} large />
          </View>
          <Button className="native-button" onClick={() => setKind('avatar')}>
            更换头像
          </Button>
        </View>
        <View className="native-player-media__item" id="native-guide-player-cover">
          <Text>球员背景</Text>
          <View className="native-player-media__preview">
            {preview.cover ? (
              <View className="native-player-media__cover-frame">
                <Image
                  className="native-player-media__cover"
                  src={resolveMediaUrl(preview.cover)!}
                  mode="aspectFill"
                />
              </View>
            ) : (
              <Text className="native-note">暂无背景</Text>
            )}
          </View>
          <Button className="native-button" onClick={() => setKind('cover')}>
            更换背景
          </Button>
        </View>
      </View>
      {kind && (
        <NativeImageCropper
          title={kind === 'avatar' ? '更换球员头像' : '更换球员背景'}
          ratio={kind === 'avatar' ? 1 : 2.8}
          output={kind === 'avatar' ? { width: 512, height: 512 } : { width: 1120, height: 400 }}
          onCancel={() => setKind(null)}
          onConfirm={async (dataUrl) => {
            const session = readSession()
            if (!session) throw Error('请先登录账号')
            if (pending.current?.data !== dataUrl || pending.current.kind !== kind)
              pending.current = { data: dataUrl, key: createClientActionId('player-' + kind), kind }
            const asset = await request<MediaAsset>('/media-assets', {
              method: 'POST',
              data: {
                purpose: kind === 'avatar' ? 'PLAYER_AVATAR' : 'PLAYER_BACKGROUND',
                targetId: playerId,
                clientSubmissionId: pending.current.key,
                dataUrl,
              },
            })
            if (readSession()?.accessToken !== session.accessToken)
              throw Error('账号已切换，请重新打开')
            await onSaved()
            setPreview((old) => ({ ...old, [kind]: dataUrl }))
            pending.current = null
            setKind(null)
            void Taro.showToast({
              title:
                asset.status === 'PENDING' && !asset.awaitingReview
                  ? '图片已提交审核'
                  : '球员图片已更新',
              icon: 'none',
            })
          }}
        />
      )}
    </>
  )
}
