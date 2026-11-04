import { resolveMediaUrl } from '../product/product.repository'
import type { MediaAsset } from './repository.h5'

/** Public GIFs use the native image cache; private media retains authorized downloads. */
export function matchGifUrl(asset: MediaAsset) {
  const url = resolveMediaUrl(asset.contentUrl)
  if (!url) throw new Error('片段地址不可用')
  return `${url}${url.includes('?') ? '&' : '?'}v=${asset.version || 1}&playback=loop-v2`
}
