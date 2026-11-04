import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { validateMedia } from './media-image'
import { dataUrl, gifFixture } from './media-test-fixtures'

test('GIF fully decodes every frame, normalizes animation, and has a static WebP poster', async () => {
  const source = await gifFixture()
  const result = await validateMedia(dataUrl(source, 'gif'), 'GOAL_GIF')
  assert.equal(result.frames, 3)
  assert.equal(result.durationMs, 300)
  assert.equal((await sharp(result.body, { animated: true }).metadata()).loop, 0)
  const decoded = await sharp(result.body, { animated: true })
    .raw()
    .toBuffer({ resolveWithObject: true })
  assert.equal(decoded.info.height, 96)
  assert.deepEqual(
    await sharp(result.body, { animated: true }).ensureAlpha().raw().toBuffer(),
    await sharp(source, { animated: true }).ensureAlpha().raw().toBuffer(),
  )
  const tagged = Buffer.concat([
    source.subarray(0, source.length - 1),
    Buffer.from([0x21, 0xfe, 6]),
    Buffer.from('SECRET'),
    Buffer.from([0, 0x3b]),
    Buffer.from('TRAILING_PAYLOAD'),
  ])
  const cleaned = await validateMedia(dataUrl(tagged, 'gif'), 'GOAL_GIF')
  assert.equal(cleaned.body.includes(Buffer.from('SECRET')), false)
  assert.equal(cleaned.body.includes(Buffer.from('TRAILING_PAYLOAD')), false)
  const poster = await sharp(result.poster).metadata()
  assert.equal(poster.format, 'webp')
  assert.equal(poster.pages ?? 1, 1)
})

test('GIF rejects forged format, truncation, frame/duration/dimension bombs, and static files', async () => {
  const gif = await gifFixture()
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#339955' } })
    .png()
    .toBuffer()
  for (const candidate of [
    dataUrl(png, 'gif'),
    dataUrl(gif.subarray(0, Math.floor(gif.length / 2)), 'gif'),
    dataUrl(await gifFixture(121), 'gif'),
    dataUrl(await gifFixture(2, 8000), 'gif'),
    dataUrl(await gifFixture(2, 100, 961, 16), 'gif'),
    dataUrl(png, 'png'),
  ])
    await assert.rejects(validateMedia(candidate, 'GOAL_GIF'))
  await assert.rejects(validateMedia(dataUrl(Buffer.alloc(6 * 1024 * 1024 + 1), 'gif'), 'GOAL_GIF'))
})

test('static purposes strip metadata, preserve separate shape rules, and reject animation', async () => {
  const source = await sharp({
    create: { width: 1600, height: 900, channels: 3, background: '#664433' },
  })
    .withMetadata()
    .jpeg()
    .toBuffer()
  const background = await validateMedia(dataUrl(source, 'jpeg'), 'USER_BACKGROUND')
  // Covers fit inside 2240×800 (2.80:1 banner, compressed above that).
  assert.equal(background.width, 1422)
  assert.equal(background.height, 800)
  assert.equal((await sharp(background.body).metadata()).exif, undefined)
  const portrait = await validateMedia(dataUrl(source, 'jpeg'), 'PLAYER_PORTRAIT')
  assert.equal(portrait.width, 1200)
  const avatar = await validateMedia(dataUrl(source, 'jpeg'), 'USER_AVATAR')
  assert.equal(avatar.width, 320)
  assert.equal(avatar.height, 320)
  assert.equal((await sharp(avatar.body).metadata()).exif, undefined)
  await assert.rejects(validateMedia(dataUrl(await gifFixture(), 'gif'), 'PLAYER_PORTRAIT'))
  await assert.rejects(validateMedia(dataUrl(source, 'png'), 'USER_BACKGROUND'))
  await assert.rejects(
    validateMedia('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'USER_BACKGROUND'),
  )
})

test('team crests have transparent circular edges and retain transparent spaces inside the emblem', async () => {
  const source = await sharp(
    Buffer.from(
      '<svg width="128" height="128"><circle cx="64" cy="64" r="58" fill="none" stroke="#12558c" stroke-width="8"/></svg>',
    ),
  )
    .png()
    .toBuffer()
  const result = await validateMedia(dataUrl(source, 'png'), 'TEAM_CREST')
  const decoded = await sharp(result.body).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const alpha = (x: number, y: number) =>
    decoded.data[(y * decoded.info.width + x) * decoded.info.channels + 3]
  assert.equal(result.width, result.height)
  for (const [x, y] of [
    [0, 0],
    [127, 0],
    [0, 127],
    [127, 127],
    [64, 64],
  ])
    assert.equal(alpha(x!, y!), 0)
  assert((alpha(64, 6) ?? 0) > 200)
  const poster = await sharp(result.poster).ensureAlpha().raw().toBuffer()
  assert.equal(poster[3], 0)
})

function box(type: string, ...payload: Buffer[]) {
  const body = Buffer.concat(payload)
  const header = Buffer.alloc(8)
  header.writeUInt32BE(body.length + 8, 0)
  header.write(type, 4, 'latin1')
  return Buffer.concat([header, body])
}
function mp4(durationMs: number, brand = 'isom', handler = 'vide') {
  const ftyp = box('ftyp', Buffer.from(`${brand}\0\0\0\0${brand}`, 'latin1'))
  const mvhd = Buffer.alloc(100)
  mvhd.writeUInt32BE(1000, 12) // timescale
  mvhd.writeUInt32BE(durationMs, 16) // duration
  const hdlr = Buffer.alloc(24)
  hdlr.write(handler, 8, 'latin1')
  const trak = box('trak', box('mdia', box('hdlr', hdlr)))
  return Buffer.concat([ftyp, box('moov', box('mvhd', mvhd), trak), box('mdat', Buffer.alloc(64))])
}

test('EVENT_CLIP accepts short MP4 clips with a re-encoded poster and GIFs; rejects the rest', async () => {
  const { mp4DurationMs } = await import('./media-image')
  assert.equal(mp4DurationMs(mp4(4000)), 4000)
  assert.equal(mp4DurationMs(mp4(4000, 'qqqq')), null)
  assert.equal(mp4DurationMs(mp4(4000, 'isom', 'soun')), null)
  const poster = await sharp({
    create: { width: 320, height: 180, channels: 3, background: '#2a6' },
  })
    .jpeg()
    .toBuffer()
  const clip = `data:video/mp4;base64,${mp4(4000).toString('base64')}`
  const still = `data:image/jpeg;base64,${poster.toString('base64')}`
  const result = await validateMedia(clip, 'EVENT_CLIP', still)
  assert.equal(result.mimeType, 'video/mp4')
  assert.equal(result.durationMs, 4000)
  assert.equal((await sharp(result.poster).metadata()).format, 'webp')
  await assert.rejects(validateMedia(clip, 'EVENT_CLIP'))
  await assert.rejects(
    validateMedia(`data:video/mp4;base64,${mp4(20_000).toString('base64')}`, 'EVENT_CLIP', still),
  )
  await assert.rejects(validateMedia(clip, 'GOAL_GIF', still))
  const gif = await validateMedia(dataUrl(await gifFixture(), 'gif'), 'EVENT_CLIP')
  assert.equal(gif.mimeType, 'image/gif')
})
