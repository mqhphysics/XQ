import assert from 'node:assert/strict'
import test from 'node:test'
import { imageCrop } from './crop.logic.ts'

test('portrait and landscape selections stay within the source and retain the avatar or cover ratio', () => {
  for (const source of [
    { width: 1800, height: 3000 },
    { width: 4000, height: 900 },
  ])
    for (const ratio of [1, 2.8])
      for (const zoom of [1, 1.5, 3])
        for (const x of [0, 0.5, 1]) {
          const crop = imageCrop(source, ratio, { zoom, x, y: 1 - x })
          assert.ok(Math.abs(crop.width / crop.height - ratio) < 0.000001)
          assert.ok(crop.x >= 0 && crop.y >= 0)
          assert.ok(crop.x + crop.width <= source.width + 0.000001)
          assert.ok(crop.y + crop.height <= source.height + 0.000001)
        }
})
test('the crop reaches photo edges and invalid pan positions cannot expose empty canvas', () => {
  const source = { width: 1000, height: 2000 }
  assert.deepEqual(imageCrop(source, 1, { zoom: 1, x: -2, y: -1 }), {
    width: 1000,
    height: 1000,
    x: 0,
    y: 0,
  })
  assert.deepEqual(imageCrop(source, 1, { zoom: 1, x: 2, y: 2 }), {
    width: 1000,
    height: 1000,
    x: 0,
    y: 1000,
  })
})
