import assert from 'node:assert/strict'
import test from 'node:test'
import type { MatchExperienceResponse } from '../product/product.types.ts'
import { nativeTimeline } from './match-detail.logic.weapp.ts'
const event = (id: string, type: string, minute: number, side = 'home') => ({
  id,
  type,
  minute,
  stoppageMinute: null,
  team: { id: side },
  player: null,
  relatedPlayer: null,
  description: null,
})
test('native timeline credits own goals correctly and groups simultaneous same-team substitutions', () => {
  const match = {
    status: 'FINISHED',
    homeTeam: { id: 'home' },
    homeScore: 1,
    awayScore: 1,
    events: [
      event('goal', 'GOAL', 10),
      event('own', 'OWN_GOAL', 20),
      event('sub1', 'SUBSTITUTION', 60),
      event('sub2', 'SUBSTITUTION', 60),
      event('miss', 'PENALTY_MISSED', 70),
    ],
  } as unknown as MatchExperienceResponse
  const rows = nativeTimeline(match)
  const entries = rows.filter((row) => row.kind === 'event')
  assert.equal(entries[0]?.score, '1 : 0')
  assert.equal(entries[1]?.score, '1 : 1')
  assert.equal(entries[2]?.events.length, 2)
  assert.equal(entries[3]?.score, null)
  assert.deepEqual(
    rows.filter((row) => row.kind === 'marker').map((row) => row.label),
    ['比赛开始', '半场 1 : 1', '全场 1 : 1'],
  )
})

test('women use a twenty-minute half and incomplete goals do not fabricate score progress', () => {
  const match = {
    status: 'FINISHED',
    periodMinutes: 20,
    homeTeam: { id: 'home' },
    homeScore: 2,
    awayScore: 0,
    events: [event('known-goal', 'GOAL', 23)],
  } as unknown as MatchExperienceResponse
  const rows = nativeTimeline(match)
  assert.deepEqual(
    rows.filter((row) => row.kind === 'marker').map((row) => row.label),
    ['比赛开始', '中场 · 事件待补', '全场 2 : 0'],
  )
  assert.equal(rows.find((row) => row.kind === 'event')?.score, null)
  const complete = nativeTimeline({ ...match, homeScore: 1 })
  assert.deepEqual(
    complete.filter((row) => row.kind === 'marker').map((row) => row.label),
    ['比赛开始', '半场 0 : 0', '全场 1 : 0'],
  )
})
