import assert from 'node:assert/strict'
import test from 'node:test'

import { sanitizeHubStripItems, sameHubStripItems } from './hub-strip-order.rules'

const TEAM = '11111111-1111-4111-8111-111111111111'
const OTHER_TEAM = '22222222-2222-4222-8222-222222222222'
const PLAYER = '33333333-3333-4333-8333-333333333333'
const PRIMARY = '44444444-4444-4444-8444-444444444444'

test('sanitizeHubStripItems keeps mixed followed order and drops the rest', () => {
  const allowed = { teamIds: new Set([TEAM, OTHER_TEAM]), playerIds: new Set([PLAYER]) }
  assert.deepEqual(
    sanitizeHubStripItems(
      [
        { kind: 'player', id: PLAYER },
        { kind: 'team', id: TEAM },
        { kind: 'team', id: PRIMARY },
        { kind: 'team', id: TEAM },
        { kind: 'coach', id: TEAM },
        { kind: 'player', id: 'not-a-uuid' },
        null,
        'team:' + TEAM,
        { kind: 'team', id: OTHER_TEAM },
      ],
      allowed,
    ),
    [
      { kind: 'player', id: PLAYER },
      { kind: 'team', id: TEAM },
      { kind: 'team', id: OTHER_TEAM },
    ],
  )
})

test('sanitizeHubStripItems treats missing or non-array payloads as empty', () => {
  const allowed = { teamIds: new Set([TEAM]), playerIds: new Set([PLAYER]) }
  assert.deepEqual(sanitizeHubStripItems(undefined, allowed), [])
  assert.deepEqual(sanitizeHubStripItems({ items: [] }, allowed), [])
})

test('sameHubStripItems compares kind and id in order', () => {
  const a = [
    { kind: 'team' as const, id: TEAM },
    { kind: 'player' as const, id: PLAYER },
  ]
  assert.equal(sameHubStripItems(a, [...a]), true)
  assert.equal(sameHubStripItems(a, [{ kind: 'player', id: PLAYER }, { kind: 'team', id: TEAM }]), false)
})
