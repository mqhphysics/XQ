import assert from 'node:assert/strict'
import test from 'node:test'
import { finalSlots } from './final-slots'

const fixtures = [
  {
    id: 'final',
    matchCode: 'CUP-FINAL',
    title: '决赛：半决赛1胜队 vs 半决赛2胜队',
    stageId: 'knockout',
  },
  {
    id: 'third',
    matchCode: 'CUP-THIRD',
    title: '三四名赛：半决赛1负队 vs 半决赛2负队',
    stageId: 'knockout',
  },
  { id: 'semi2', matchCode: 'CUP-SF-02', title: '半决赛', stageId: 'knockout' },
  { id: 'semi1', matchCode: 'CUP-SF-01', title: '半决赛', stageId: 'knockout' },
]

test('published final placeholders use the declared semifinal numbers for both winners and losers', () => {
  assert.deepEqual(finalSlots(fixtures)?.slots, [
    { targetMatchId: 'final', side: 'HOME', source: { type: 'MATCH_WINNER', matchId: 'semi1' } },
    { targetMatchId: 'final', side: 'AWAY', source: { type: 'MATCH_WINNER', matchId: 'semi2' } },
    { targetMatchId: 'third', side: 'HOME', source: { type: 'MATCH_LOSER', matchId: 'semi1' } },
    { targetMatchId: 'third', side: 'AWAY', source: { type: 'MATCH_LOSER', matchId: 'semi2' } },
  ])
  assert.equal(finalSlots(fixtures.slice(0, 3)), null)
  assert.equal(
    finalSlots([
      { ...fixtures[0]!, title: '决赛：半决赛2胜队 vs 半决赛1胜队' },
      ...fixtures.slice(1),
    ]),
    null,
  )
})
