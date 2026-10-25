import Taro from '@tarojs/taro'
import { readSession } from '../product/session'
import {
  chooseNativePostImages,
  releaseNativePostImages,
  type NativeDraftImage,
} from './images.weapp'

export interface SavedNativeEmoji extends NativeDraftImage {
  id: string
}
function key() {
  const user = readSession()?.user
  if (!user) throw new Error('请先登录后收藏表情')
  return `xiaoqiu:native-emoji:v1:${user.organizationId}:${user.id}`
}
export function readSavedNativeEmoji(): SavedNativeEmoji[] {
  if (!readSession()) return []
  return Taro.getStorageSync<SavedNativeEmoji[]>(key()) || []
}
export async function addSavedNativeEmoji() {
  const ownerKey = key()
  const images = await chooseNativePostImages(1)
  if (!readSession() || ownerKey !== key()) {
    await releaseNativePostImages(images)
    throw new Error('账号已切换，请重新添加')
  }
  const result = [
    ...readSavedNativeEmoji(),
    ...images.map((image) => ({
      ...image,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    })),
  ]
  try {
    Taro.setStorageSync(ownerKey, result)
  } catch (issue) {
    await releaseNativePostImages(images)
    throw issue
  }
  return result
}
export async function removeSavedNativeEmoji(id: string) {
  const before = readSavedNativeEmoji(),
    removed = before.filter((item) => item.id === id),
    result = before.filter((item) => item.id !== id)
  Taro.setStorageSync(key(), result)
  await releaseNativePostImages(removed)
  return result
}
