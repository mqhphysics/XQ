import { createHash } from 'node:crypto'
import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import sharp from 'sharp'
import { ApiHttpException } from '../common/api-http.exception'
import { normalizeAvatarImage } from '../media/media.service'
import type { MediaPurpose } from './managed-media.dto'
import { sanitizeLoopingGif } from './gif-animation'

export interface ValidatedMedia {
  body: Buffer
  poster: Buffer
  mimeType: 'image/gif' | 'image/webp' | 'video/mp4'
  checksum: string
  width: number
  height: number
  frames: number
  durationMs: number
}

export function invalidMedia(message: string) {
  return new ApiHttpException(HttpStatus.BAD_REQUEST, { code: ERROR_CODES.BAD_REQUEST, message })
}

export async function validateMedia(
  dataUrl: string,
  purpose: MediaPurpose,
  posterDataUrl?: string,
): Promise<ValidatedMedia> {
  if (purpose === 'EVENT_CLIP' && dataUrl.startsWith('data:video/'))
    return validateClip(dataUrl, posterDataUrl)
  const match = /^data:image\/(gif|jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match || match[2]!.length % 4 !== 0)
    throw invalidMedia('请选择完整的 GIF、JPEG、PNG 或 WebP 图片')
  const subtype = match[1]!
  const animated = purpose === 'GOAL_GIF' || purpose === 'EVENT_CLIP'
  if (animated !== (subtype === 'gif'))
    throw invalidMedia('比赛事件投稿仅支持 GIF 或 MP4 短视频；资料照片不支持动画')
  const source = Buffer.from(match[2]!, 'base64')
  if (source.toString('base64') !== match[2]) throw invalidMedia('图片编码无效')
  const limit = animated ? 6 * 1024 * 1024 : 4 * 1024 * 1024
  if (source.length > limit) throw invalidMedia(`文件不能超过 ${limit / 1024 / 1024} MiB`)
  try {
    const metadata = await sharp(source, {
      animated: true,
      failOn: 'error',
      limitInputPixels: 32 * 1024 * 1024,
    }).metadata()
    if (metadata.format !== subtype) throw invalidMedia('声明格式与实际图片内容不一致')
    const width = metadata.width ?? 0
    const height = metadata.pageHeight ?? metadata.height ?? 0
    const frames = metadata.pages ?? 1
    if (animated) {
      if (width < 16 || height < 16 || width > 960 || height > 960 || frames < 2 || frames > 120)
        throw invalidMedia('GIF 需为 16–960 像素、2–120 帧')
      const durationMs = (metadata.delay ?? []).reduce((sum, delay) => sum + delay, 0)
      if (durationMs < 40 || durationMs > 15_000 || (metadata.delay?.length ?? 0) !== frames)
        throw invalidMedia('GIF 单次播放不能超过 15 秒')
      // Decode every frame before retaining its palette/pixel blocks. Strip non-rendering payloads
      // separately so an upload gains infinite looping without a second palette quantization.
      await sharp(source, {
        animated: true,
        failOn: 'error',
        limitInputPixels: 32 * 1024 * 1024,
      })
        .raw()
        .toBuffer()
      const body = sanitizeLoopingGif(source)
      if (body.length > limit) throw invalidMedia('处理后的 GIF 超过 6 MiB')
      const poster = await sharp(body, { page: 0, pages: 1, failOn: 'error' })
        .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 76 })
        .toBuffer()
      return {
        body,
        poster,
        mimeType: 'image/gif',
        checksum: digest(body),
        width,
        height,
        frames,
        durationMs,
      }
    }
    if (frames !== 1) throw invalidMedia('资料图片不支持动画，请选择静态图片')
    if (width < 64 || height < 64)
      throw invalidMedia(`图片太小（${width}×${height}），请选择至少 64×64 像素的图片`)
    if (width > 4096 || height > 4096)
      throw invalidMedia(`图片尺寸过大（${width}×${height}），请选择不超过 4096×4096 像素的图片`)
    let body: Buffer
    if (purpose === 'USER_AVATAR' || purpose === 'PLAYER_AVATAR') {
      body = (await normalizeAvatarImage(source, subtype as 'jpeg' | 'png' | 'webp')).body
    } else if (purpose === 'TEAM_CREST') {
      const edge = Math.min(512, Math.max(width, height))
      const square = await sharp(source, { failOn: 'error', limitInputPixels: 16 * 1024 * 1024 })
        .rotate()
        .resize(edge, edge, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .ensureAlpha()
        .png()
        .toBuffer()
      const mask = Buffer.from(
        `<svg width="${edge}" height="${edge}"><circle cx="${edge / 2}" cy="${edge / 2}" r="${edge / 2}" fill="white"/></svg>`,
      )
      body = await sharp(square)
        .composite([{ input: mask, blend: 'dest-in' }])
        .webp({ quality: 82, effort: 4 })
        .toBuffer()
    } else {
      // Covers display as a 2.80:1 banner; keep up to 2240×800 (≈1.9× the largest 1920px
      // display), anything larger is scaled down. Other photos keep a 1200px edge.
      const box =
        purpose === 'USER_BACKGROUND' ||
        purpose === 'PLAYER_BACKGROUND' ||
        purpose === 'TEAM_BACKGROUND'
          ? { width: 2240, height: 800 }
          : { width: 1200, height: 1200 }
      body = await sharp(source, { failOn: 'error', limitInputPixels: 16 * 1024 * 1024 })
        .rotate()
        .resize({ ...box, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toBuffer()
    }
    if (body.length > 2 * 1024 * 1024) throw invalidMedia('处理后的图片超过 2 MiB')
    const output = await sharp(body).metadata()
    const poster = await sharp(body)
      .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 76 })
      .toBuffer()
    return {
      body,
      poster,
      mimeType: 'image/webp',
      checksum: digest(body),
      width: output.width!,
      height: output.height!,
      frames: 1,
      durationMs: 0,
    }
  } catch (error) {
    if (error instanceof ApiHttpException) throw error
    throw invalidMedia('图片无法完整解码或超出处理限制')
  }
}

const CLIP_LIMIT = 10 * 1024 * 1024
const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'dash',
  'M4V ',
  'MSNV',
])

/**
 * Short MP4 clips for match events. The container is structurally checked (ftyp brand, moov/mvhd
 * duration, a video track) and served only as video/mp4 with nosniff + sandbox CSP; the still
 * poster comes from the client and is fully decoded and re-encoded like any other image.
 */
async function validateClip(dataUrl: string, posterDataUrl?: string): Promise<ValidatedMedia> {
  const match = /^data:video\/mp4;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match || match[1]!.length % 4 !== 0) throw invalidMedia('短视频仅支持 MP4 格式')
  const source = Buffer.from(match[1]!, 'base64')
  if (source.toString('base64') !== match[1]) throw invalidMedia('视频编码无效')
  if (source.length > CLIP_LIMIT) throw invalidMedia('短视频不能超过 10 MiB')
  const durationMs = mp4DurationMs(source)
  if (durationMs === null) throw invalidMedia('无法识别的 MP4 视频')
  if (durationMs < 200 || durationMs > 15_000) throw invalidMedia('短视频需为 15 秒以内')
  const poster = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    posterDataUrl ?? '',
  )
  if (!poster) throw invalidMedia('缺少视频封面')
  try {
    const still = Buffer.from(poster[2]!, 'base64')
    const metadata = await sharp(still, {
      failOn: 'error',
      limitInputPixels: 16 * 1024 * 1024,
    }).metadata()
    if (metadata.format !== poster[1] || (metadata.pages ?? 1) !== 1)
      throw invalidMedia('视频封面无效')
    const image = await sharp(still, { failOn: 'error', limitInputPixels: 16 * 1024 * 1024 })
      .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 76 })
      .toBuffer({ resolveWithObject: true })
    return {
      body: source,
      poster: image.data,
      mimeType: 'video/mp4',
      checksum: digest(source),
      width: Math.max(1, Math.min(1600, metadata.width ?? image.info.width)),
      height: Math.max(1, Math.min(1600, metadata.height ?? image.info.height)),
      frames: 1,
      durationMs,
    }
  } catch (error) {
    if (error instanceof ApiHttpException) throw error
    throw invalidMedia('视频封面无法解码')
  }
}

/** Walks ISO-BMFF boxes: requires ftyp first, a moov with mvhd, and a video handler. */
export function mp4DurationMs(buffer: Buffer): number | null {
  const boxes = (start: number, end: number) => {
    const found: Array<{ type: string; start: number; end: number }> = []
    let offset = start
    while (offset + 8 <= end) {
      let size = buffer.readUInt32BE(offset)
      const type = buffer.toString('latin1', offset + 4, offset + 8)
      let header = 8
      if (size === 1) {
        if (offset + 16 > end) return null
        const big = buffer.readBigUInt64BE(offset + 8)
        if (big > BigInt(end - offset)) return null
        size = Number(big)
        header = 16
      } else if (size === 0) size = end - offset
      if (size < header || offset + size > end) return null
      found.push({ type, start: offset + header, end: offset + size })
      offset += size
    }
    return found
  }
  const top = boxes(0, buffer.length)
  if (!top || top[0]?.type !== 'ftyp') return null
  const ftyp = top[0]
  const brands = [buffer.toString('latin1', ftyp.start, ftyp.start + 4)]
  for (let at = ftyp.start + 8; at + 4 <= ftyp.end; at += 4)
    brands.push(buffer.toString('latin1', at, at + 4))
  if (!brands.some((brand) => MP4_BRANDS.has(brand))) return null
  const moov = top.find((box) => box.type === 'moov')
  if (!moov) return null
  const inner = boxes(moov.start, moov.end)
  const mvhd = inner?.find((box) => box.type === 'mvhd')
  if (!inner || !mvhd || mvhd.end - mvhd.start < 32) return null
  const version = buffer.readUInt8(mvhd.start)
  const timescale = buffer.readUInt32BE(mvhd.start + (version === 1 ? 20 : 12))
  const duration =
    version === 1
      ? Number(buffer.readBigUInt64BE(mvhd.start + 24))
      : buffer.readUInt32BE(mvhd.start + 16)
  if (!timescale) return null
  const hasVideo = inner
    .filter((box) => box.type === 'trak')
    .some((trak) => {
      for (let at = buffer.indexOf('hdlr', trak.start, 'latin1'); at >= 0 && at < trak.end; ) {
        if (buffer.toString('latin1', at + 12, at + 16) === 'vide') return true
        at = buffer.indexOf('hdlr', at + 4, 'latin1')
      }
      return false
    })
  if (!hasVideo) return null
  return Math.round((duration / timescale) * 1000)
}

function digest(body: Buffer) {
  return createHash('sha256').update(body).digest('hex')
}
