import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeFavoriteCursor, encodeFavoriteCursor } from './favorite-pagination'

test('favorite cursor preserves a timestamp tie independently of a deleted anchor and binds the account', () => {
  const row = {
    id: '11111111-1111-4111-8111-111111111111',
    createdAt: new Date('2026-11-01T00:00:00.123Z'),
  }
  const encoded = encodeFavoriteCursor(row, 'org', 'user')
  assert.deepEqual(decodeFavoriteCursor(encoded, 'org', 'user'), row)
  assert.throws(() => decodeFavoriteCursor(encoded, 'other', 'user'), /游标无效/)
  assert.throws(() => decodeFavoriteCursor(encoded, 'org', 'other'), /游标无效/)
  assert.throws(() => decodeFavoriteCursor('bad', 'org', 'user'), /游标无效/)
  assert.equal(decodeFavoriteCursor(row.id, 'org', 'user'), null)
})
