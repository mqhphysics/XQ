import Taro from '@tarojs/taro'
import { resolveMediaUrl } from '../product/product.repository'
import { downloadCloudApiMedia } from '../cloud-api/download.weapp'
import { createMediaPreloader } from './media-preload.logic'
import type { MediaAsset } from './repository.h5'

const gifCache = createMediaPreloader(
  async (url) => (await downloadCloudApiMedia(url, {}, 'gif')).tempFilePath,
  (path) => {
    try {
      Taro.getFileSystemManager().accessSync(path)
      return true
    } catch {
      return false
    }
  },
)
const urlFor = (asset: MediaAsset) => {
  if (asset.status === 'PENDING') throw new Error('待审核片段请点击查看')
  const url = resolveMediaUrl(asset.contentUrl)
  if (!url) throw new Error('片段地址不可用')
  return `${url}${url.includes('?') ? '&' : '?'}v=${asset.version || 1}`
}
export const preloadMatchGif = (asset: MediaAsset) => gifCache.get(urlFor(asset))
export const forgetMatchGif = (asset: MediaAsset) => gifCache.forget(urlFor(asset))
