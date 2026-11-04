import { createHash } from 'node:crypto'

import sharp from 'sharp'

// 960/1440 serve wide hero and detail photos as WebP instead of the original file.
export const MEDIA_VARIANT_WIDTHS = [64, 96, 128, 256, 480, 720, 960, 1440] as const

const cache = new Map<string, { body: Buffer; mimeType: string }>()
const CACHE_LIMIT = 200

export function parseVariantWidth(raw: unknown): number | undefined {
  const width = Number(raw)
  return (MEDIA_VARIANT_WIDTHS as readonly number[]).includes(width) ? width : undefined
}

export async function resizeMedia(
  body: Buffer,
  mimeType: string,
  width: number | undefined,
): Promise<{ body: Buffer; mimeType: string }> {
  if (!width || mimeType === 'image/gif' || body.length < 32) return { body, mimeType }
  const key = `${createHash('sha1').update(body).digest('hex')}:${width}`
  const hit = cache.get(key)
  if (hit) return hit
  const resized = await sharp(body, { failOn: 'none', animated: true })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer()
  const variant = { body: resized, mimeType: 'image/webp' }
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, variant)
  return variant
}
