import assert from 'node:assert/strict'
import test from 'node:test'

import { createGetCache } from './get-cache.ts'

test('a fresh GET is reused and a stale GET is dropped', () => {
  const cache = createGetCache()
  cache.put('home', { ok: true }, '"v1"', 1_000)
  assert.deepEqual(cache.peek('home', 500, 1_200), { ok: true })
  assert.equal(cache.peek('home', 500, 1_600), undefined)
  assert.equal(cache.read('home')?.etag, '"v1"')
  assert.equal(cache.fresh('home', 500, 1_200), true)
  cache.clear()
  assert.equal(cache.read('home'), undefined)
})

test('markStale keeps data for rendering but stops treating it as fresh', () => {
  const cache = createGetCache()
  const seen: string[] = []
  cache.subscribe((key) => seen.push(key))
  cache.put('schedule', { n: 1 }, undefined, 1_000)
  cache.markStale()
  assert.deepEqual(cache.peek('schedule', 10_000, 1_100), { n: 1 })
  assert.equal(cache.fresh('schedule', 10_000, 1_100), false)
  cache.put('schedule', { n: 2 }, undefined, 1_200)
  assert.equal(cache.fresh('schedule', 10_000, 1_300), true)
  assert.deepEqual(seen, ['schedule', 'schedule'])
  const copy = createGetCache()
  copy.restore(cache.entries())
  assert.deepEqual(copy.peek('schedule', 10_000, 1_300), { n: 2 })
})
