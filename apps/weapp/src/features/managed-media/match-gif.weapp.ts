import { resolveMediaUrl } from '../product/product.repository'
import type { MediaAsset } from './repository.h5'

/** A versioned source URL is downloaded in full before native playback. */
export function matchGifUrl(asset: Pick<MediaAsset, 'contentUrl' | 'version'>) {
  const url = resolveMediaUrl(asset.contentUrl)
  if (!url) throw new Error('片段地址不可用')
  return `${url}${url.includes('?') ? '&' : '?'}v=${asset.version || 1}&playback=loop-v2`
}
