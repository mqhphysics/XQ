import assert from 'node:assert/strict'
import test from 'node:test'
import { loopGifForever } from './gif-loop.ts'

const header = [71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 0, 0, 0]
const image = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0, 0x3b]
const extension = [
  0x21,
  0xff,
  11,
  ...Array.from('NETSCAPE2.0', (c) => c.charCodeAt(0)),
  3,
  1,
  1,
  0,
  0,
]
test('looping inserts metadata without modifying image bytes and is idempotent', () => {
  const input = new Uint8Array([...header, ...image]).buffer
  const result = loopGifForever(input)
  assert.deepEqual(Array.from(new Uint8Array(result).slice(-image.length)), image)
  assert.equal(loopGifForever(result), result)
  assert.equal(new Uint8Array(input).length, header.length + image.length)
})
test('an existing one-shot GIF changes exactly the loop count bytes', () => {
  const input = new Uint8Array([...header, ...extension, ...image]).buffer
  const result = new Uint8Array(loopGifForever(input))
  const expected = new Uint8Array(input.slice(0))
  expected[header.length + 16] = 0
  assert.deepEqual(result, expected)
})
