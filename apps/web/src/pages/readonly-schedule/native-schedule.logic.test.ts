import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeScheduleDayGroups } from './native-schedule.logic.weapp.ts'
import {
  nativeRelativeDay,
  emptyScheduleFilter,
  filterNativeSchedule,
  nativeMatchDate,
} from './native-schedule.logic.weapp.ts'

test('the adjacent dates are labeled yesterday, today and tomorrow across month and year boundaries', () => {
  assert.equal(nativeRelativeDay('2026-12-31', '2027-01-01'), '昨天')
  assert.equal(nativeRelativeDay('2027-01-01', '2027-01-01'), '今天')
  assert.equal(nativeRelativeDay('2027-01-02', '2027-01-01'), '明天')
  assert.equal(nativeRelativeDay('2026-12-30', '2027-01-01'), '')
  assert.equal(nativeRelativeDay('2027-01-03', '2027-01-01'), '')
})
import { createBracketLayout } from '../../features/competition/competition.logic.ts'
import type { MatchSummary } from '../../features/product/product.types.ts'

function match(id: string, changes: Partial<MatchSummary> = {}): MatchSummary {
  return {
    id,
    tournamentId: 'fictional-tournament',
    matchCode: id,
    title: id,
    status: 'SCHEDULED',
    scheduledStartAt: '2026-09-01T02:00:00Z',
    homeTeam: null,
    awayTeam: null,
    homeScore: null,
    awayScore: null,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    statusReason: null,
    venue: null,
    ...changes,
  }
}
test('today remains an explicit scroll target between past and future even without games', () => {
  const rows = [
    match('old', { scheduledStartAt: '2026-10-26T02:00:00Z' }),
    match('next', { scheduledStartAt: '2026-10-28T02:00:00Z' }),
  ]
  const groups = nativeScheduleDayGroups(rows, emptyScheduleFilter, '2026-10-27')
  assert.deepEqual(
    groups.map(([date]) => date),
    ['2026-10-26', '2026-10-27', '2026-10-28'],
  )
  assert.equal(groups[1]![1].length, 0)
  assert.equal(nativeMatchDate('2026-10-26T16:10:00Z'), '2026-10-27')
  assert.equal(
    nativeScheduleDayGroups([], { ...emptyScheduleFilter, date: '2026-10-26' }, '2026-10-27')
      .length,
    0,
  )
})
test('mobile dates use the league calendar across UTC midnight', () => {
  assert.equal(nativeMatchDate('2026-08-31T18:00:00Z'), '2026-09-01')
  assert.equal(nativeMatchDate(null), 'TBD')
  const rows = [
    match('evening', { scheduledStartAt: '2026-08-31T18:00:00Z' }),
    match('previous', { scheduledStartAt: '2026-08-31T02:00:00Z' }),
  ]
  assert.deepEqual(
    filterNativeSchedule(rows, { ...emptyScheduleFilter, date: '2026-09-01' }).map((row) => row.id),
    ['evening'],
  )
})
test('finished, live and upcoming filters retain correct statuses, and undated games stay last', () => {
  const rows = [
    match('confirmed', { status: 'CONFIRMED' }),
    match('live', { status: 'LIVE' }),
    match('postponed', { status: 'POSTPONED' }),
    match('unknown', { scheduledStartAt: null }),
  ]
  assert.deepEqual(
    filterNativeSchedule(rows, { ...emptyScheduleFilter, status: 'finished' }).map((row) => row.id),
    ['confirmed'],
  )
  assert.deepEqual(
    filterNativeSchedule(rows, { ...emptyScheduleFilter, status: 'live' }).map((row) => row.id),
    ['live'],
  )
  assert.deepEqual(
    filterNativeSchedule(rows, {
      ...emptyScheduleFilter,
      status: 'upcoming',
      descending: true,
    }).map((row) => row.id),
    ['postponed', 'unknown'],
  )
  assert.equal(
    filterNativeSchedule(rows, { ...emptyScheduleFilter, primaryOnly: true }, null).length,
    0,
  )
})
test('every mobile knockout parent is centred on its two sources without connector drift', () => {
  const rounds = [
    {
      id: 'qf',
      name: '八强',
      matches: [1, 2, 3, 4].map((i) => ({ id: `q${i}`, matchCode: `KO-QF-${i}` })),
    },
    {
      id: 'sf',
      name: '半决赛',
      matches: [1, 2].map((i) => ({ id: `s${i}`, matchCode: `KO-SF-${i}` })),
    },
    { id: 'f', name: '决赛', matches: [{ id: 'final', matchCode: 'KO-FINAL' }] },
  ]
  const layout = createBracketLayout(rounds)
  for (const node of layout.nodes.filter((item) => item.roundIndex > 0)) {
    const parents = layout.nodes.filter((item) => item.roundIndex === node.roundIndex - 1)
    const siblings = layout.nodes.filter((item) => item.roundIndex === node.roundIndex)
    const index = siblings.indexOf(node)
    const first = parents[index * 2]!,
      second = parents[index * 2 + 1]!
    assert.equal(
      node.y + node.height / 2,
      (first.y + first.height / 2 + second.y + second.height / 2) / 2,
    )
    const target = layout.connectors.filter((line) => line.targetMatchId === node.matchId)
    assert.ok(
      target.some(
        (line) => line.orientation === 'horizontal' && line.y === node.y + node.height / 2,
      ),
    )
  }
})
