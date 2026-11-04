import test from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultRecorderLineup,
  recentRecords,
  recordRows,
  orderedRecorderPlayers,
  recorderGeometry,
  recorderModeOf,
  recorderRows,
  recorderTeamState,
  resolveRecorderLineup,
  splitLineup,
  substitute,
} from './board.logic.weapp.ts'
import { createRequire } from 'node:module'
const { technicalTotals } = createRequire(import.meta.url)('@xiaoqiu/contracts')
test('same-screen recording keeps player and unattributed team actions additive, with goals counted once', () => {
  const operations = [
    {
      id: '1',
      occurredAt: '2026-10-28',
      kind: 'COUNT' as const,
      teamId: 'team',
      playerId: 'player',
      metric: 'PASS' as const,
      outcome: 'SUCCESS' as const,
    },
    {
      id: '2',
      occurredAt: '2026-10-28',
      kind: 'COUNT' as const,
      teamId: 'team',
      playerId: null,
      metric: 'PASS' as const,
      outcome: 'SUCCESS' as const,
    },
    {
      id: '3',
      occurredAt: '2026-10-28',
      kind: 'COUNT' as const,
      teamId: 'team',
      playerId: 'player',
      metric: 'SHOT' as const,
      outcome: 'GOAL' as const,
    },
  ]
  assert.equal(technicalTotals(operations, 'team').passSuccess, 2)
  assert.equal(technicalTotals(operations, 'team', 'player').passSuccess, 1)
  assert.equal(technicalTotals(operations, 'team').shotsOnTarget, 1)
  assert.equal(technicalTotals(operations, 'team').goals, 1)
  assert.equal(recordRows.length, 6)
  assert.deepEqual(
    orderedRecorderPlayers([{ id: 'a' }, { id: 'b' }, { id: 'new' }], ['b', 'removed', 'a']).map(
      (player) => player.id,
    ),
    ['b', 'a', 'new'],
  )
})
test('rows run top-to-bottom with high-frequency actions lowest; 精简 keeps 犯规/机会/射门 and grows', () => {
  assert.deepEqual(
    recordRows.map((row) => row.metric),
    ['FOUL', 'CHANCE', 'SHOT', 'DRIBBLE', 'TACKLE', 'PASS'],
  )
  assert.deepEqual(
    recorderRows('lite').map((row) => row.metric),
    ['FOUL', 'CHANCE', 'SHOT'],
  )
  assert.equal(recorderModeOf('lite'), 'lite')
  assert.equal(recorderModeOf(undefined), 'full')
  assert.equal(recorderModeOf('weird'), 'full')
  for (const height of [560, 640, 704, 760]) {
    const full = recorderGeometry(height, 'full'),
      lite = recorderGeometry(height, 'lite')
    assert.ok(full.rowHeight >= 40)
    assert.ok(lite.rowHeight > full.rowHeight * 1.6)
    /* Fits exactly: the page is scroll-locked, so any extra height would be clipped. */
    assert.equal(full.height, height)
    assert.equal(lite.height, height)
  }
  /* Small phones in 完整: rows shrink instead of overflowing. */
  for (const height of [500, 520]) {
    const full = recorderGeometry(height, 'full')
    assert.equal(full.height, height)
    assert.ok(full.rowHeight >= 36 && full.rowHeight < 54)
    assert.equal(recorderGeometry(height, 'lite').height, height)
  }
  assert.equal(recorderGeometry(704, 'full').height, 704)
  assert.equal(recorderTeamState(0, 0, null), 'team')
  assert.equal(recorderTeamState(0, 0, 'player'), 'player')
  assert.equal(recorderTeamState(1, 0, 'player'), 'idle')
})
const squad = (
  count: number,
  extra: Record<string, { starter?: boolean; position?: string }> = {},
) =>
  Array.from({ length: count }, (_, index) => ({
    id: 'p' + (count - index),
    shirtNumber: String(count - index),
    ...extra['p' + (count - index)],
  }))
test('default seven: confirmed starters without the goalkeeper, else lowest shirt numbers', () => {
  assert.deepEqual(defaultRecorderLineup(squad(10)).pitch, [
    'p1',
    'p2',
    'p3',
    'p4',
    'p5',
    'p6',
    'p7',
  ])
  assert.deepEqual(defaultRecorderLineup(squad(10)).bench, ['p8', 'p9', 'p10'])
  const starters: Record<string, { starter: boolean; position?: string }> = Object.fromEntries(
    ['p1', 'p3', 'p4', 'p5', 'p8', 'p9', 'p10', 'p2'].map((id) => [id, { starter: true }]),
  )
  starters.p1 = { starter: true, position: 'GOALKEEPER' }
  const lineup = defaultRecorderLineup(squad(12, starters))
  assert.deepEqual(lineup.pitch, ['p2', 'p3', 'p4', 'p5', 'p8', 'p9', 'p10'])
  assert.deepEqual(lineup.bench, ['p1', 'p6', 'p7', 'p11', 'p12'])
  assert.deepEqual(defaultRecorderLineup(squad(4)), { pitch: ['p1', 'p2', 'p3', 'p4'], bench: [] })
})
test('a saved lineup survives roster changes and keeps seven on the pitch', () => {
  const players = squad(9)
  const saved = { pitch: ['p9', 'gone', 'p1', 'p2', 'p3', 'p4', 'p5'], bench: ['p8', 'p6'] }
  assert.deepEqual(resolveRecorderLineup(players, saved), {
    pitch: ['p9', 'p1', 'p2', 'p3', 'p4', 'p5', 'p8'],
    bench: ['p6', 'p7'],
  })
  assert.deepEqual(resolveRecorderLineup(players, ['old', 'array']), defaultRecorderLineup(players))
  assert.deepEqual(resolveRecorderLineup(players, null), defaultRecorderLineup(players))
})
test('drag order splits at the old boundary; long-press substitution swaps', () => {
  const lineup = { pitch: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], bench: ['x', 'y'] }
  assert.deepEqual(splitLineup(['b', 'c', 'd', 'a', 'e', 'f', 'g', 'x', 'y'], 7), {
    pitch: ['b', 'c', 'd', 'a', 'e', 'f', 'g'],
    bench: ['x', 'y'],
  })
  // y dragged up into the third pitch slot: g is pushed to the bench.
  assert.deepEqual(splitLineup(['a', 'b', 'y', 'c', 'd', 'e', 'f', 'g', 'x'], 7), {
    pitch: ['a', 'b', 'y', 'c', 'd', 'e', 'f'],
    bench: ['g', 'x'],
  })
  assert.deepEqual(substitute(lineup, 'c', 'y'), {
    pitch: ['a', 'b', 'y', 'd', 'e', 'f', 'g'],
    bench: ['x', 'c'],
  })
  assert.equal(substitute(lineup, 'x', 'y'), lineup)
})
test('recent strip shows the newest three active records, newest first', () => {
  const teams = [
    {
      id: 't',
      shortName: '教院',
      players: [{ id: 'p7', displayName: '白书羽', shirtNumber: '7' }],
    },
  ]
  const op = (id: string, metric: string, outcome: string, playerId: string | null = 'p7') => ({
    id,
    occurredAt: '2026-10-31',
    kind: 'COUNT' as const,
    teamId: 't',
    playerId,
    metric: metric as 'PASS',
    outcome: outcome as 'SUCCESS',
  })
  const recent = recentRecords(
    [
      op('1', 'PASS', 'SUCCESS'),
      op('2', 'TACKLE', 'FAILURE'),
      op('3', 'PASS', 'SUCCESS', null),
      op('4', 'SHOT', 'ON_TARGET'),
    ],
    teams,
  )
  assert.deepEqual(
    recent.map((item) => item.text),
    ['7 白书羽 · 射正', '教院 全队 · 传球✓', '7 白书羽 · 抢断✗'],
  )
})
