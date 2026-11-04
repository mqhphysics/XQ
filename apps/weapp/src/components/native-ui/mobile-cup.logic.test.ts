import assert from 'node:assert/strict'
import test from 'node:test'
import type { CompetitionDataResponse, MatchSummary } from '../../features/product/product.types.ts'
import { hasReachedKnockout, mobileCupNodes, mobileCupRounds } from './mobile-cup.logic.weapp.ts'

function match(
  code: string,
  status: MatchSummary['status'] = 'SCHEDULED',
  group = false,
): MatchSummary {
  return {
    id: code,
    tournamentId: 'test-cup',
    matchCode: code,
    title: code,
    status,
    scheduledStartAt: null,
    homeTeam: null,
    awayTeam: null,
    homeScore: null,
    awayScore: null,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    statusReason: null,
    venue: null,
    stageType: group ? 'GROUP' : 'KNOCKOUT',
  }
}
function cup(): CompetitionDataResponse {
  return {
    tournament: { id: 'test-cup', name: '测试杯', seasonName: '2026', status: 'PUBLISHED' },
    seasons: [],
    schedule: [match('G1', 'FINISHED', true), match('G2', 'SCHEDULED', true)],
    groups: [{ id: 'A', name: 'A组', standings: [] }],
    leaders: { scorers: [], assists: [] },
    updatedAt: '2026-10-16T00:00:00Z',
    bracket: [
      { id: 'q', name: '八强', number: 1, matches: [4, 2, 1, 3].map((n) => match(`QF${n}`)) },
      { id: 's', name: '半决赛', number: 2, matches: [match('SF2'), match('SF1')] },
      { id: 'f', name: '决赛', number: 3, matches: [match('THIRD'), match('FINAL')] },
    ],
  }
}
test('a pre-created bracket stays hidden until group play finishes or knockout actually starts', () => {
  const data = cup()
  assert.equal(hasReachedKnockout(data), false)
  data.schedule[1]!.status = 'CONFIRMED'
  assert.equal(hasReachedKnockout(data), true)
  data.schedule[1]!.status = 'SCHEDULED'
  data.bracket[0]!.matches[0]!.status = 'LIVE'
  assert.equal(hasReachedKnockout(data), true)
  data.bracket = []
  assert.equal(hasReachedKnockout(data), false)
})
test('a cup without a group stage shows its published bracket without inventing group progress', () => {
  const data = cup()
  data.schedule = []
  data.groups = []
  assert.equal(hasReachedKnockout(data), true)
  data.groups = [{ id: 'A', name: 'A组', standings: [] }]
  assert.equal(hasReachedKnockout(data), false)
})
test('mobile bracket preserves quarterfinal order, keeps third place separate and fits screen width', () => {
  const { rounds, thirdPlace, eightTeam } = mobileCupRounds(cup())
  assert.equal(eightTeam, true)
  assert.deepEqual(
    rounds[0]!.matches.map((m) => m.id),
    ['QF1', 'QF2', 'QF3', 'QF4'],
  )
  assert.equal(thirdPlace?.id, 'THIRD')
  const ids = mobileCupNodes.map((n) => rounds[n.round]!.matches[n.match]!.id)
  assert.equal(new Set(ids).size, 7)
  assert.equal(ids.includes('THIRD'), false)
  for (const n of mobileCupNodes) {
    assert.ok(n.left >= 0 && n.left + n.width <= 100)
    assert.ok(n.top + n.height <= 816)
  }
  const upperSemi = mobileCupNodes.find((n) => n.round === 1 && n.match === 0)!
  const sourceCenters = mobileCupNodes
    .filter((n) => n.round === 0 && n.match < 2)
    .map((n) => n.left + n.width / 2)
  assert.equal(upperSemi.left + upperSemi.width / 2, (sourceCenters[0]! + sourceCenters[1]!) / 2)
})
