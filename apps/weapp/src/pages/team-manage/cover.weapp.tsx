import Taro from '@tarojs/taro'
import { useRef } from 'react'
import { NativeImageCropper } from '../../components/avatar-cropper/image.weapp'
import { request, createClientActionId } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
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
  const pending = useRef<{ data: string; key: string } | null>(null)
  return (
    <NativeImageCropper
      title="更换球队背景"
      ratio={2.8}
      output={{ width: 1120, height: 400 }}
      onCancel={onClose}
      onConfirm={async (dataUrl) => {
        const owner = readSession()?.accessToken
        if (!owner) throw Error('请先登录账号')
        if (pending.current?.data !== dataUrl)
          pending.current = { data: dataUrl, key: createClientActionId('team-cover') }
        const asset = await request<MediaAsset>('/media-assets', {
          method: 'POST',
          data: {
            purpose: 'TEAM_BACKGROUND',
            targetId: teamId,
            clientSubmissionId: pending.current.key,
            dataUrl,
          },
        })
        if (readSession()?.accessToken !== owner) throw Error('账号已切换，请重新打开球队管理')
        await onSaved()
        onClose()
        void Taro.showToast({
          title:
            asset.status === 'PENDING' && !asset.awaitingReview
              ? '背景已提交审核'
              : '球队背景已更新',
          icon: 'none',
        })
      }}
    />
  )
}
