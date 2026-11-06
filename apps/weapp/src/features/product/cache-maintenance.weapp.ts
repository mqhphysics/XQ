import Taro from '@tarojs/taro'
import { clearNativeGifCache, nativeGifCacheUsage } from '../managed-media/gif-cache.weapp'
import { invalidateNativeProductReads } from './product.repository'
import { productGetCache } from './get-cache'
export { nativeGifCacheUsage }
export async function clearRebuildableCache() {
  await clearNativeGifCache()
  productGetCache.clear()
  Taro.removeStorageSync('xiaoqiu.native-read-snapshot.v1')
  invalidateNativeProductReads()
}
