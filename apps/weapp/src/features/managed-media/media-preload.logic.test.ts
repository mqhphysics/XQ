import assert from 'node:assert/strict'
import test from 'node:test'
import { createMediaPreloader } from './media-preload.logic.ts'

test('match GIF preloading shares requests and limits downloads to two at a time', async () => {
  const release = new Map<string, () => void>()
  const calls: string[] = []
  const loader = createMediaPreloader(
    (url) =>
      new Promise((resolve) => {
        calls.push(url)
        release.set(url, () => resolve(url + '.gif'))
      }),
  )
  const a = loader.get('a'),
    again = loader.get('a'),
    b = loader.get('b'),
    c = loader.get('c')
  await Promise.resolve()
  assert.deepEqual(calls, ['a', 'b'])
  release.get('a')!()
  assert.equal(await a, await again)
  await new Promise<void>((resolve) => queueMicrotask(resolve))
  assert.deepEqual(calls, ['a', 'b', 'c'])
  release.get('b')!()
  release.get('c')!()
  await Promise.all([b, c])
})

test('failed downloads retry, and an evicted temporary file is downloaded again', async () => {
  let calls = 0,
    exists = true
  const loader = createMediaPreloader(
    async () => {
      if (++calls === 1) throw new Error('offline')
      exists = true
      return 'clip.gif'
    },
    () => exists,
  )
  await assert.rejects(loader.get('clip'), /offline/)
  assert.equal(await loader.get('clip'), 'clip.gif')
  assert.equal(calls, 2)
  exists = false
  assert.equal(await loader.get('clip'), 'clip.gif')
  assert.equal(calls, 3)
})
