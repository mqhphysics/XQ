import assert from 'node:assert/strict'
import test from 'node:test'
import { tintLeafGif } from './team-leaf-tint.weapp.ts'
import { leafAnimationBase64, leafStillBase64 } from './team-leaf-frames.weapp.ts'

test('team recoloring preserves GIF timing, transparency and compressed pixels', () => {
  const gif = Uint8Array.from(
    Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
  )
  const tinted = tintLeafGif(gif, '#036972')
  assert.deepEqual([...tinted.slice(13, 19)], [3, 105, 114, 3, 105, 114])
  assert.deepEqual(tinted.slice(0, 13), gif.slice(0, 13))
  assert.deepEqual(tinted.slice(19), gif.slice(19))
  assert.notDeepEqual(gif, tinted)
})
test('every generated animation and still frame can take the real team palette', () => {
  for (const source of [leafAnimationBase64, leafStillBase64]) {
    const gif = Uint8Array.from(Buffer.from(source, 'base64'))
    const tinted = tintLeafGif(gif, '#e53233')
    assert.equal(tinted.length, gif.length)
    assert.equal(tinted[tinted.length - 1], 59)
  }
})
test('the slightly faster ornament changes timing while keeping frame pixels intact', () => {
  const gif = Uint8Array.from(
    Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
  )
  gif[23] = 10
  const normal = tintLeafGif(gif, '#036972'),
    faster = tintLeafGif(gif, '#036972', 1.25)
  assert.equal(faster[23], 8)
  assert.deepEqual(faster.slice(25), normal.slice(25))
})
