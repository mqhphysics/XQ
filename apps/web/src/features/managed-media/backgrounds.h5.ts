import { resolveMediaUrl } from '../product/product.repository'

const teamDefaultBackground = resolveMediaUrl('/api/media/defaults/team-cover-v2.webp')!
const personalDefaultBackground = resolveMediaUrl('/api/media/defaults/user-cover-v1.webp')!
const playerDefaultBackground = resolveMediaUrl('/api/media/defaults/player-cover-v1.webp')!

/**
 * Every personal and team background is stored as a 2.80:1 image (uploads are cropped in the
 * browser at that ratio and stored as the cropped output, max 2240×800). The defaults below are
 * real images pre-cropped at the same ratio and size, so every place renders the stored image in
 * one 2.80:1 frame and the framing always matches (no runtime re-cropping, no blur fill).
 */
export const BACKGROUND_RATIO = 2.8
export { teamDefaultBackground, personalDefaultBackground }

export function teamBackgroundUrl(coverUrl: string | null | undefined): string {
  return resolveMediaUrl(coverUrl) ?? teamDefaultBackground
}

export function personalBackgroundUrl(url: string | null | undefined): string {
  return resolveMediaUrl(url) ?? personalDefaultBackground
}
export function playerBackgroundUrl(url: string | null | undefined): string {
  return resolveMediaUrl(url) ?? playerDefaultBackground
}
