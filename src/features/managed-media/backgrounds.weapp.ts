import { resolveMediaUrl } from '../product/product.repository'

export const teamBackgroundUrl = (url?: string | null) =>
  resolveMediaUrl(url) || resolveMediaUrl('/api/media/defaults/team-cover-v2.webp')!
export const personalBackgroundUrl = (url?: string | null) =>
  resolveMediaUrl(url) || resolveMediaUrl('/api/media/defaults/user-cover-v1.webp')!
export const playerBackgroundUrl = (url?: string | null) =>
  resolveMediaUrl(url) || resolveMediaUrl('/api/media/defaults/player-cover-v1.webp')!
