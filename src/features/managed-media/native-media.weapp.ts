import Taro from '@tarojs/taro'
import { createClientActionId, request, resolveMediaUrl } from '../product/product.repository'
import { readSession } from '../product/session'
import type { MediaAsset } from './repository.h5'
import { downloadCloudApiMedia } from '../cloud-api/download.weapp'

export const nativeMatchMedia = (matchId: string) =>
  request<{ items: MediaAsset[] }>(`/media-assets/matches/${encodeURIComponent(matchId)}/goals`)
export async function preparePlayerPortrait(playerId: string) {
  const choice = await Taro.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
  })
  let file = choice.tempFilePaths[0]!
  const info = await Taro.getImageInfo({ src: file })
  const scale = Math.min(1, 1600 / Math.max(info.width, info.height))
  if (scale < 1)
    file = (
      await Taro.compressImage({
        src: file,
        quality: 82,
        compressedWidth: Math.round(info.width * scale),
        compressedHeight: Math.round(info.height * scale),
      })
    ).tempFilePath
  const compressed = await Taro.getImageInfo({ src: file })
  const base64 = await new Promise<string>((resolve, reject) =>
    Taro.getFileSystemManager().readFile({
      filePath: file,
      encoding: 'base64',
      success: (result) => resolve(String(result.data)),
      fail: reject,
    }),
  )
  const mime =
    compressed.type === 'png'
      ? 'image/png'
      : compressed.type === 'webp'
        ? 'image/webp'
        : 'image/jpeg'
  return {
    purpose: 'PLAYER_PORTRAIT' as const,
    targetId: playerId,
    clientSubmissionId: createClientActionId('player-photo'),
    dataUrl: `data:${mime};base64,${base64}`,
  }
}
export const submitPlayerPortrait = (input: Awaited<ReturnType<typeof preparePlayerPortrait>>) =>
  request<MediaAsset>('/media-assets', { method: 'POST', data: input })
export async function ownMediaImage(path: string): Promise<string> {
  const session = readSession()
  if (!session) throw new Error('请先登录账号')
  const result = await downloadCloudApiMedia(resolveMediaUrl(path)!, {
    Authorization: `Bearer ${session.accessToken}`,
    'x-organization-id': session.user.organizationId,
  })
  if (result.statusCode !== 200 || readSession()?.accessToken !== session.accessToken)
    throw new Error('照片读取失败，请重新打开')
  return result.tempFilePath
}
