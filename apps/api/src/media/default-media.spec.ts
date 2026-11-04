import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import {
  DEFAULT_COVERS,
  defaultAvatar,
  defaultCover,
  defaultMediaName,
  readDefaultMedia,
} from './default-media'

test('defaults remain distinct per identity and preserve uploaded pictures', () => {
  assert.equal(new Set(Object.values(DEFAULT_COVERS)).size, 3)
  assert.equal(defaultCover('player', null), DEFAULT_COVERS.player)
  assert.equal(
    defaultCover('user', '/api/media-assets/custom/content'),
    '/api/media-assets/custom/content',
  )
  assert.equal(defaultAvatar('user', 'fixed'), defaultAvatar('user', 'fixed'))
  assert.equal(defaultAvatar('player', 'fixed'), null)
  assert.equal(defaultAvatar('user', 'fixed', '/my-photo.webp'), '/my-photo.webp')
})
test('player initials replace legacy illustrations while uploaded photos and user avatars remain', () => {
  for (const kind of ['user', 'player']) {
    const old = `/api/media/defaults/${kind}-avatar-03-v1.webp`
    assert.equal(defaultAvatar('player', 'fixed', old), null)
    assert.equal(defaultAvatar('player', 'fixed', `https://api.example${old}?w=96`), null)
    assert.equal(defaultAvatar('user', 'fixed', old), old)
  }
  assert.equal(
    defaultAvatar('player', 'fixed', '/api/media/avatars/real-photo.webp'),
    '/api/media/avatars/real-photo.webp',
  )
})
test('only explicit default asset names are readable, including every avatar variant', async () => {
  for (const value of [
    '/api/media/defaults/../../secrets',
    '/api/media/defaults/unknown.webp',
    'file:///etc/passwd',
  ])
    assert.equal(defaultMediaName(value), null)
  assert.equal(await readDefaultMedia('../schema.prisma'), null)
  for (const value of Object.values(DEFAULT_COVERS)) {
    const image = await readDefaultMedia(defaultMediaName(value)!)
    assert(image)
    const metadata = await sharp(image.body).metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.width, 2240)
    assert.equal(metadata.height, 800)
  }
  for (let index = 1; index <= 16; index++) {
    const name = `user-avatar-${String(index).padStart(2, '0')}-v1.webp`,
      image = await readDefaultMedia(name)
    assert(image)
    const decoded = await sharp(image.body)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    assert.equal(decoded.info.width, 256)
    assert.equal(decoded.info.height, 256)
    assert.equal(decoded.data[3], 0)
  }
})
