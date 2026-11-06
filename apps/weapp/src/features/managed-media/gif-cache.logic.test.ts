import assert from 'node:assert/strict'
import test from 'node:test'
import { createGifCache, GIF_CACHE_TTL, type GifCacheIndex } from './gif-cache.logic.ts'
import { gifInfo } from './gif-info.logic.ts'
const fixture = () => {
  const header = [...Buffer.from('GIF89a'), 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255]
  const frame = [0x21, 0xf9, 4, 0, 10, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0]
  return Uint8Array.from([...header, ...frame, ...frame, ...frame, 0x3b]).buffer
}
const asset = {
  id: 'test-gif',
  contentUrl: '/gif',
  version: 1,
  bytes: fixture().byteLength,
  frames: 3,
  durationMs: 300,
}

test('cache clearing refuses active downloads and only removes managed GIF entries', async () => {
  const s = storage(),
    cache = createGifCache(s.io)
  const download = cache.load(asset)
  await assert.rejects(cache.clear(), /仍在下载/)
  await download
  assert.equal((await cache.usage()).count, 1)
  await cache.clear()
  assert.equal((await cache.usage()).bytes, 0)
  assert.equal(s.files.size, 0)
  await cache.load(asset)
  assert.equal(s.fetches(), 2)
})
function storage() {
  let now = 0,
    index: GifCacheIndex = {},
    fetches = 0
  const files = new Map<string, ArrayBuffer>()
  const io = {
    index: async () => structuredClone(index),
    persist: async (value: GifCacheIndex) => {
      index = structuredClone(value)
    },
    read: async (key: string) => {
      if (!files.has(key)) throw Error('missing')
      return files.get(key)!
    },
    write: async (key: string, bytes: ArrayBuffer) => {
      files.set(key, bytes)
    },
    remove: async (key: string) => {
      files.delete(key)
    },
    path: (key: string) => 'local/' + key,
    fetch: async () => {
      fetches++
      await new Promise((r) => setTimeout(r, 1))
      return fixture()
    },
    now: () => now,
  }
  return {
    io,
    files,
    advance: (ms: number) => {
      now += ms
    },
    fetches: () => fetches,
  }
}
test('a complete looping GIF is retained across exits and cache instances for three days', async () => {
  const s = storage(),
    cache = createGifCache(s.io)
  const paths = await Promise.all([cache.load(asset), cache.load(asset)])
  assert.equal(paths[0], paths[1])
  assert.equal(s.fetches(), 1)
  assert.deepEqual(gifInfo([...s.files.values()][0]!), {
    width: 1,
    height: 1,
    frames: 3,
    durationMs: 300,
    loop: 0,
  })
  s.advance(GIF_CACHE_TTL - 1)
  assert.equal(await createGifCache(s.io).load(asset), paths[0])
  assert.equal(s.fetches(), 1)
  s.advance(2)
  await createGifCache(s.io).load(asset)
  assert.equal(s.fetches(), 2)
  await cache.load({ ...asset, version: 2 })
  assert.equal(s.fetches(), 3)
})
test('truncated downloads and broken cached files are never handed to playback', async () => {
  const s = storage()
  await assert.rejects(
    createGifCache({ ...s.io, fetch: async () => fixture().slice(0, -1) }).load(asset),
  )
  assert.equal(s.files.size, 0)
  await createGifCache(s.io).load(asset)
  s.files.set('test-gif-1', fixture().slice(0, -1))
  await createGifCache(s.io).load(asset)
  assert.equal(s.fetches(), 2)
  assert.throws(() => gifInfo(fixture().slice(0, -1)))
})
