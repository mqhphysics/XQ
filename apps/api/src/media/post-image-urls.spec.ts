import assert from 'node:assert/strict'
import test from 'node:test'

import { DEMO_POSTS } from '../database/demo-fixture'
import { postImageUrls } from './media.service'

test('demo album tokens expand to campus photo paths', () => {
  assert.deepEqual(postImageUrls('/api/media/demo/album:04,03,05'), [
    '/api/media/demo/photos/04.webp',
    '/api/media/demo/photos/03.webp',
    '/api/media/demo/photos/05.webp',
  ])
  assert.deepEqual(postImageUrls('/api/media/demo/photos/08.webp'), [
    '/api/media/demo/photos/08.webp',
  ])
  assert.deepEqual(postImageUrls(null), [])
})

test('masonry demo posts keep album covers inside the existing image field', () => {
  const albums = DEMO_POSTS.filter((post) => post.imageUrl?.includes('/demo/album:'))
  assert.equal(albums.length, 2)
  for (const post of albums) {
    const urls = postImageUrls(post.imageUrl ?? null)
    assert.ok(urls.length >= 2)
    assert.ok(urls.every((url) => url.startsWith('/api/media/demo/photos/')))
  }
})
