import assert from 'node:assert/strict'
import test from 'node:test'

import { alternatingColumns } from './home-feed-layout.ts'

test('columns alternate image and text posts and keep every post once', () => {
  const items = ['i1', 't1', 'i2', 't2', 'i3', 't3', 'i4', 't4', 'i5']
  const columns = alternatingColumns(items, 3, (item) => item.startsWith('i'))
  assert.deepEqual(columns, [
    ['i1', 't2', 'i4'],
    ['t1', 'i3', 't4'],
    ['i2', 't3', 'i5'],
  ])
  assert.equal(columns.flat().length, items.length)
})

test('falls back to the other kind when one runs out', () => {
  const columns = alternatingColumns(['t1', 't2', 't3'], 2, () => false)
  assert.deepEqual(columns, [['t1', 't3'], ['t2']])
})
