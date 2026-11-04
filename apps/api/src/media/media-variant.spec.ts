import assert from 'node:assert/strict'
import test from 'node:test'

import sharp from 'sharp'

import { parseVariantWidth, resizeMedia } from './media-variant'

test('only the published widths are accepted', () => {
  assert.equal(parseVariantWidth('96'), 96)
  assert.equal(parseVariantWidth('100'), undefined)
  assert.equal(parseVariantWidth(undefined), undefined)
})

test('a width query returns a smaller webp and the original stays intact without one', async () => {
  const source = await sharp({
    create: { width: 400, height: 300, channels: 3, background: '#1f6b45' },
  })
    .png()
    .toBuffer()
  const original = await resizeMedia(source, 'image/png', undefined)
  assert.equal(original.body.equals(source), true)
  assert.equal(original.mimeType, 'image/png')
  const variant = await resizeMedia(source, 'image/png', 96)
  assert.equal(variant.mimeType, 'image/webp')
  assert.ok(variant.body.length < source.length)
  const meta = await sharp(variant.body).metadata()
  assert.equal(meta.width, 96)
})
