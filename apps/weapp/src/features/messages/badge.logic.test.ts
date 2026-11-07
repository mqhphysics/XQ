import assert from 'node:assert/strict'
import test from 'node:test'
import { messageActorLabel, messageBadge } from './badge.logic.ts'

test('private counts take priority over dots without placing a glyph inside a dot', () => {
  assert.deepEqual(messageBadge(1, true), { kind: 'count', label: '1' })
  assert.deepEqual(messageBadge(100, true), { kind: 'count', label: '99+' })
  assert.deepEqual(messageBadge(0, true), { kind: 'dot', label: '' })
  assert.equal(messageBadge(-1, false), null)
})
test('aggregated notice names only describe actual supplied actors and count', () => {
  assert.equal(messageActorLabel([{ displayName: '甲' }, { displayName: '乙' }], 8), '甲、乙等8人')
  assert.equal(messageActorLabel([{ displayName: '甲' }], 1), '甲')
})
