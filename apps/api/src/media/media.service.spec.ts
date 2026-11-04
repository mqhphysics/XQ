import assert from 'node:assert/strict'
import test from 'node:test'

import { HttpStatus } from '@nestjs/common'
import sharp from 'sharp'

import { ApiHttpException } from '../common/api-http.exception'
import { normalizeAvatarImage, normalizePostImage } from './media.service'

const OUTPUT_EDGE = 320
const MAX_OUTPUT_BYTES = 72 * 1024

type AvatarSubtype = 'jpeg' | 'png' | 'webp'

for (const subtype of ['png', 'jpeg', 'webp'] as const) {
  test(`normalizeAvatarImage fully decodes ${subtype.toUpperCase()} and emits a metadata-free square WebP`, async () => {
    const source = await createFixture(512, 512, subtype)
    const sourceMetadata = await sharp(source).metadata()
    assert.ok(sourceMetadata.exif, 'the source fixture should contain removable EXIF metadata')

    const normalized = await normalizeAvatarImage(source, subtype)
    assert.equal(normalized.mimeType, 'image/webp')
    assert.equal(normalized.subtype, 'webp')
    assert.equal(normalized.width, OUTPUT_EDGE)
    assert.equal(normalized.height, OUTPUT_EDGE)
    assert.ok(normalized.body.length < MAX_OUTPUT_BYTES)

    const output = sharp(normalized.body, { failOn: 'error' })
    const metadata = await output.metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.width, OUTPUT_EDGE)
    assert.equal(metadata.height, OUTPUT_EDGE)
    assert.equal(metadata.orientation, undefined)
    assert.equal(metadata.exif, undefined)
    assert.equal(metadata.icc, undefined)
    assert.equal(metadata.iptc, undefined)
    assert.equal(metadata.xmp, undefined)

    const decoded = await output.raw().toBuffer({ resolveWithObject: true })
    assert.equal(decoded.info.width, OUTPUT_EDGE)
    assert.equal(decoded.info.height, OUTPUT_EDGE)
    assert.equal(
      decoded.data.length,
      decoded.info.width * decoded.info.height * decoded.info.channels,
      'the complete normalized image should decode, not only its header',
    )
  })
}

test('normalizeAvatarImage rejects a declaration that does not match the image bytes', async () => {
  const png = await createFixture(128, 128, 'png')

  await assertBadAvatar(() => normalizeAvatarImage(png, 'jpeg'), '头像文件内容与格式不一致')
})

test('normalizeAvatarImage rejects a damaged image even when its header remains recognizable', async () => {
  const png = await createFixture(128, 128, 'png')
  const truncated = png.subarray(0, png.length - 32)
  const metadata = await sharp(truncated, { failOn: 'none' }).metadata()
  assert.equal(metadata.format, 'png', 'fixture should retain a parseable PNG header')

  await assertBadAvatar(() => normalizeAvatarImage(truncated, 'png'), '头像文件无法完整解码')
})

test('normalizeAvatarImage crops a rectangular photo at its centre without stretching or enlarging it', async () => {
  const landscape = await sharp(
    Buffer.from(
      '<svg width="384" height="128"><rect width="128" height="128" fill="red"/><rect x="128" width="128" height="128" fill="#00c000"/><rect x="256" width="128" height="128" fill="blue"/></svg>',
    ),
  )
    .png()
    .toBuffer()
  const normalized = await normalizeAvatarImage(landscape, 'png')
  assert.equal(normalized.width, 128)
  assert.equal(normalized.height, 128)
  const pixels = await sharp(normalized.body)
    .extract({ left: 32, top: 32, width: 64, height: 64 })
    .removeAlpha()
    .stats()
  assert.ok(pixels.channels[0]!.max < 12, 'the red left edge is outside the centre crop')
  assert.ok(pixels.channels[1]!.min > 180, 'the green centre survives the crop')
  assert.ok(pixels.channels[2]!.max < 12, 'the blue right edge is outside the centre crop')
})

test('normalizeAvatarImage rejects image dimensions above the server safety limit', async () => {
  const ordinaryPhoto = await normalizeAvatarImage(await createFixture(513, 513, 'webp'), 'webp')
  assert.equal(ordinaryPhoto.width, OUTPUT_EDGE)
  assert.ok(ordinaryPhoto.body.length <= MAX_OUTPUT_BYTES)
  const oversized = await createFixture(8001, 64, 'webp')
  await assertBadAvatar(() => normalizeAvatarImage(oversized, 'webp'))
})

async function createFixture(
  width: number,
  height: number,
  subtype: AvatarSubtype,
): Promise<Buffer> {
  const pixels = Buffer.allocUnsafe(width * height * 3)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3
      pixels[offset] = (x * 17 + y * 3) % 256
      pixels[offset + 1] = (x * 5 + y * 29) % 256
      pixels[offset + 2] = (x * 11 + y * 7) % 256
    }
  }

  const image = sharp(pixels, { raw: { width, height, channels: 3 } }).withMetadata({
    density: 144,
    orientation: 3,
  })
  if (subtype === 'png') return image.png().toBuffer()
  if (subtype === 'jpeg') return image.jpeg({ quality: 88 }).toBuffer()
  return image.webp({ quality: 88 }).toBuffer()
}

async function assertBadAvatar(
  action: () => Promise<unknown>,
  expectedMessage?: string,
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof ApiHttpException)
    assert.equal(error.getStatus(), HttpStatus.BAD_REQUEST)
    if (expectedMessage) {
      const response = error.getResponse()
      assert.equal(
        typeof response === 'object' && response !== null && 'message' in response
          ? response.message
          : undefined,
        expectedMessage,
      )
    }
    return true
  })
}

for (const subtype of ['jpeg', 'png', 'webp'] as const) {
  test(`post photos preserve landscape proportions and remove metadata for ${subtype}`, async () => {
    const source = await createFixture(480, 320, subtype)
    const image = await normalizePostImage(
      `data:image/${subtype};base64,${source.toString('base64')}`,
    )
    assert.equal(image.width, 480)
    assert.equal(image.height, 320)
    assert.ok(image.body.length <= 768 * 1024)
    const metadata = await sharp(image.body).metadata()
    assert.equal(metadata.exif, undefined)
    assert.equal(metadata.format, 'webp')
  })
}

test('post photos reject forged formats and truncated data', async () => {
  const source = await createFixture(320, 180, 'png')
  await assertBadAvatar(
    () => normalizePostImage(`data:image/jpeg;base64,${source.toString('base64')}`),
    '动态图片内容与格式不一致',
  )
  await assertBadAvatar(() =>
    normalizePostImage(`data:image/png;base64,${source.subarray(0, 80).toString('base64')}`),
  )
  await assertBadAvatar(() => normalizePostImage('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='))
})

test('post GIFs retain all frames, delays and looping; excessive animations are rejected', async () => {
  const pixels = Buffer.alloc(96 * 192 * 3)
  pixels.fill(255, 0, 96 * 96 * 3)
  const source = await sharp(pixels, {
    raw: { width: 96, height: 192, channels: 3, pageHeight: 96 },
  })
    .gif({ delay: [80, 120], loop: 0 })
    .toBuffer()
  const image = await normalizePostImage(`data:image/gif;base64,${source.toString('base64')}`)
  const metadata = await sharp(image.body, { animated: true }).metadata()
  assert.equal(metadata.pages, 2)
  assert.deepEqual(metadata.delay, [80, 120])
  assert.equal(metadata.loop, 0)
  assert.equal(image.width, 96)
  assert.equal(image.height, 96)
  const oversized = await sharp({
    create: { width: 8001, height: 64, channels: 3, background: 'red' },
  })
    .gif()
    .toBuffer()
  await assertBadAvatar(() =>
    normalizePostImage(`data:image/gif;base64,${oversized.toString('base64')}`),
  )
})
