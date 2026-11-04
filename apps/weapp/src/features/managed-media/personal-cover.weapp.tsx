import Taro from '@tarojs/taro'
import { useRef } from 'react'
import { NativeImageCropper } from '../../components/avatar-cropper/image.weapp'
import { createClientActionId, productRepository, request } from '../product/product.repository'
import { readSession, saveSession } from '../product/session'
import type { AuthUser } from '../product/product.types'
import type { MediaAsset } from './repository.h5'

export function NativePersonalCoverEditor({
  userId,
  onClose,
  onSaved,
}: {
  userId: string
  onClose: () => void
  onSaved: (user: AuthUser, background: string | null) => void
}) {
  const submission = useRef<{ data: string; key: string } | null>(null)
  return (
    <NativeImageCropper
      title="更换个人背景"
      ratio={2.8}
      output={{ width: 1120, height: 400 }}
      onCancel={onClose}
      onConfirm={async (dataUrl) => {
        const owner = readSession()
        if (!owner || owner.user.id !== userId) throw new Error('账号已切换，请重新打开个人背景')
        if (submission.current?.data !== dataUrl)
          submission.current = { data: dataUrl, key: createClientActionId('personal-cover') }
        const asset = await request<MediaAsset>('/media-assets', {
          method: 'POST',
          data: {
            purpose: 'USER_BACKGROUND',
            targetId: userId,
            clientSubmissionId: submission.current.key,
            dataUrl,
          },
        })
        if (readSession()?.accessToken !== owner.accessToken)
          throw new Error('账号已切换，请重新打开个人资料')
        const [updated, presentation] = await Promise.all([
          productRepository.getMe(),
          request<{ backgroundUrl: string | null }>(
            `/media-assets/users/${encodeURIComponent(userId)}/presentation`,
          ),
        ])
        if (readSession()?.accessToken !== owner.accessToken)
          throw new Error('账号已切换，请重新打开个人资料')
        saveSession({ ...owner, user: updated })
        onSaved(updated, presentation.backgroundUrl)
        onClose()
        void Taro.showToast({
          title:
            asset.status === 'PENDING' && !asset.awaitingReview ? '背景已提交审核' : '背景已更新',
          icon: 'none',
        })
      }}
    />
  )
}
