import assert from 'node:assert/strict'
import test from 'node:test'
import { completeGifBytes } from './gif-chunks.logic.ts'
test('GIF chunks are assembled in byte order and resolve only when every range is complete', async () => {
  const bytes = 1200000,
    original = new Uint8Array(bytes).map((_, i) => i % 251),
    calls: number[] = []
  const result = await completeGifBytes(bytes, async (start, end) => {
    await new Promise((r) => setTimeout(r, start === 0 ? 20 : 1))
    calls.push(start)
    return {
      statusCode: 206,
      data: original.slice(start, end + 1).buffer,
      header: { 'Content-Range': `bytes ${start}-${end}/${bytes}` },
    }
  })
  assert.ok(calls[0] !== 0)
  assert.deepEqual(new Uint8Array(result), original)
})
test('a short or mismatched range is rejected rather than played as a partial GIF', async () => {
  await assert.rejects(
    completeGifBytes(600000, async (start, end) => ({
      statusCode: 206,
      data: new ArrayBuffer(end - start),
      header: { 'content-range': `bytes ${start}-${end}/600000` },
    })),
  )
  await assert.rejects(
    completeGifBytes(600000, async (start, end) => ({
      statusCode: 206,
      data: new ArrayBuffer(end - start + 1),
      header: { 'content-range': 'bytes 0-1/2' },
    })),
  )
})
