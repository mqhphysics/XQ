import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyHubOrder,
  insertFollowKey,
  moveItem,
  parseHubOrder,
  parseHubOrderText,
  pickSpotlightMatches,
  removeFollowKey,
  spotlightKind,
} from './hub-order.logic.ts'

test('applyHubOrder pins saved mixed order then appends leftover teams before players', () => {
  const teams = [{ id: 't-a' }, { id: 't-b' }, { id: 't-c' }]
  const players = [{ id: 'p-1' }, { id: 'p-2' }]
  const ordered = applyHubOrder(teams, players, [
    { kind: 'player', id: 'p-2' },
    { kind: 'team', id: 't-b' },
    { kind: 'player', id: 'missing' },
    { kind: 'team', id: 't-b' },
  ])
  assert.deepEqual(
    ordered.map((item) => `${item.kind}:${item.item.id}`),
    ['player:p-2', 'team:t-b', 'team:t-a', 'team:t-c', 'player:p-1'],
  )
})

test('parseHubOrder drops invalid keys and duplicates', () => {
  assert.deepEqual(
    parseHubOrder([
      { kind: 'team', id: 'alpha' },
      { kind: 'player', id: 'beta' },
      { kind: 'team', id: 'alpha' },
      { kind: 'coach', id: 'nope' },
      { kind: 'team', id: '' },
      null,
      'team:alpha',
    ]),
    [
      { kind: 'team', id: 'alpha' },
      { kind: 'player', id: 'beta' },
    ],
  )
  assert.deepEqual(parseHubOrderText('{"items":[]}'), [])
  assert.deepEqual(parseHubOrderText('[{"kind":"player","id":"p1"}]'), [
    { kind: 'player', id: 'p1' },
  ])
})

test('moveItem reorders without mutating the source', () => {
  const source = ['a', 'b', 'c', 'd']
  assert.deepEqual(moveItem(source, 0, 2), ['b', 'c', 'a', 'd'])
  assert.deepEqual(moveItem(source, 3, 1), ['a', 'd', 'b', 'c'])
  assert.deepEqual(source, ['a', 'b', 'c', 'd'])
  assert.deepEqual(moveItem(source, 1, 1), ['a', 'b', 'c', 'd'])
  assert.deepEqual(moveItem(source, -1, 2), ['a', 'b', 'c', 'd'])
})

test('follow key insert and remove stay unique', () => {
  const start = insertFollowKey([], { kind: 'team', id: 't1' })
  assert.deepEqual(insertFollowKey(start, { kind: 'team', id: 't1' }), start)
  assert.deepEqual(removeFollowKey(start, { kind: 'team', id: 't1' }), [])
})

test('spotlight prefers latest finished plus next upcoming', () => {
  const matches = [
    { id: 'old', status: 'FINISHED', scheduledStartAt: '2026-09-01T10:00:00.000Z' },
    { id: 'latest', status: 'CONFIRMED', scheduledStartAt: '2026-10-01T10:00:00.000Z' },
    { id: 'later', status: 'SCHEDULED', scheduledStartAt: '2026-11-02T10:00:00.000Z' },
    { id: 'next', status: 'SCHEDULED', scheduledStartAt: '2026-11-01T10:00:00.000Z' },
    { id: 'draft', status: 'DRAFT', scheduledStartAt: '2026-10-20T10:00:00.000Z' },
  ]
  const cards = pickSpotlightMatches(matches)
  assert.deepEqual(
    cards.map((match) => match.id),
    ['latest', 'next'],
  )
  assert.equal(spotlightKind(cards[0]!, 0, cards), 'finished')
  assert.equal(spotlightKind(cards[1]!, 1, cards), 'upcoming')
})

test('spotlight falls back to two most recent finished matches', () => {
  const matches = [
    { id: 'a', status: 'FINISHED', scheduledStartAt: '2026-08-01T10:00:00.000Z' },
    { id: 'b', status: 'FINISHED', scheduledStartAt: '2026-09-01T10:00:00.000Z' },
    { id: 'c', status: 'ABANDONED', scheduledStartAt: '2026-10-01T10:00:00.000Z' },
    { id: 'skip', status: 'CANCELLED', scheduledStartAt: '2026-10-20T10:00:00.000Z' },
  ]
  assert.deepEqual(
    pickSpotlightMatches(matches).map((match) => match.id),
    ['c', 'b'],
  )
})

test('live matches count as the next upcoming card', () => {
  const matches = [
    { id: 'done', status: 'FINISHED', scheduledStartAt: '2026-10-01T10:00:00.000Z' },
    { id: 'soon', status: 'SCHEDULED', scheduledStartAt: '2026-10-20T10:00:00.000Z' },
    { id: 'now', status: 'LIVE', scheduledStartAt: '2026-10-21T10:00:00.000Z' },
  ]
  assert.deepEqual(
    pickSpotlightMatches(matches).map((match) => match.id),
    ['done', 'now'],
  )
})
