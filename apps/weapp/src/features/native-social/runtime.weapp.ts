import Taro from '@tarojs/taro'
import { readSession } from '../product/session'
import { productRepository, productRequest } from '../product/product.repository'
import type { PostComment } from '../product/product.types'

export interface NativePostComment extends PostComment {
  imageUrls?: string[]
}
import { nativeWriteEnabled, type NativeWriteFeature } from './config.weapp'
import { draftStorageKey } from './interaction.logic.weapp'

export function requireNativeWrite(feature: NativeWriteFeature) {
  if (!nativeWriteEnabled(feature)) throw new Error('发布功能暂未开放')
  if (!readSession()) throw new Error('请先登录账号')
}
async function performNativeWrite<T>(feature: NativeWriteFeature, action: () => Promise<T>) {
  requireNativeWrite(feature)
  const token = readSession()!.accessToken
  const value = await action()
  if (readSession()?.accessToken !== token) throw new Error('账号已切换，请重新打开页面')
  return value
}
export function readNativeDraft<T>(scope: string, fallback: T): T {
  const user = readSession()?.user
  if (!user) return fallback
  return Taro.getStorageSync<T>(draftStorageKey(user.organizationId, user.id, scope)) || fallback
}
export function saveNativeDraft(scope: string, value: unknown) {
  const user = readSession()?.user
  if (user) Taro.setStorageSync(draftStorageKey(user.organizationId, user.id, scope), value)
}
export function clearNativeDraft(scope: string) {
  const user = readSession()?.user
  if (user) Taro.removeStorageSync(draftStorageKey(user.organizationId, user.id, scope))
}
export const nativeSocialApi = {
  createPost: (...args: Parameters<typeof productRepository.createPost>) => {
    return performNativeWrite('publishPosts', () => productRepository.createPost(...args))
  },
  commentPost: (
    postId: string,
    body: string,
    clientCommentId: string,
    parentCommentId?: string,
    repostToFeed = false,
    imageDataUrls?: string[],
  ) => {
    return performNativeWrite('postComments', () =>
      productRequest<NativePostComment>(`/community/posts/${encodeURIComponent(postId)}/comments`, {
        method: 'POST',
        data: {
          body,
          clientCommentId,
          repostToFeed,
          ...(parentCommentId ? { parentCommentId } : {}),
          ...(imageDataUrls?.length ? { imageDataUrls } : {}),
        },
      }),
    )
  },
  commentMatch: (...args: Parameters<typeof productRepository.reviewMatch>) => {
    return performNativeWrite('matchComments', () => productRepository.reviewMatch(...args))
  },
  sendMessage: (...args: Parameters<typeof productRepository.sendMessage>) => {
    return performNativeWrite('privateMessages', () => productRepository.sendMessage(...args))
  },
}
