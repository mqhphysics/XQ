import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { confirmedResultFact, type ConfirmedResultRow } from './confirmed-result'
import { parseResultsRules } from './parse-rules'
import { parseProgressionRules } from './progression-rules'

const row: ConfirmedResultRow = {
  organizationId: 'FICTIONAL_TEST_ORG',
  tournamentId: 'cup',
  stageId: 'stage',
  groupId: null,
  roundId: null,
  scheduledStartAt: null,
  id: 'match',
  homeTeamId: 'a',
  awayTeamId: 'b',
  confirmedReportVersion: 2,
  reportRevisionId: 'revision-2',
  ruleVersionId: 'rules',
  playedAt: new Date(),
  fields: {
    outcome: 'FINISHED',
    homeScore: '0',
    awayScore: '3',
    notes: 'PRIVATE',
    _matchContext: {
      organizationId: 'FICTIONAL_TEST_ORG',
      matchId: 'match',
      tournamentId: 'cup',
      stageId: 'stage',
      groupId: null,
      roundId: null,
      homeTeamId: 'a',
      awayTeamId: 'b',
      scheduledStartAt: null,
    },
  },
  projectionSourceVersion: 1,
  projectionRevisionId: 'revision-1',
  projectionPayload: { homeScore: 99, notes: 'PRIVATE_CACHE' },
}

test('public facts rebuild the latest confirmed version when the projection is stale or missing', () => {
  const fact = confirmedResultFact(row)!
  assert.equal(fact.revision, 2)
  assert.equal(fact.homeScore, 0)
  assert.equal(fact.awayScore, 3)
  assert.equal(JSON.stringify(fact).includes('PRIVATE'), false)
  assert.deepEqual(
    fact,
    confirmedResultFact({
      ...row,
      projectionPayload: null,
      projectionSourceVersion: null,
      projectionRevisionId: null,
    }),
  )
  assert.equal(confirmedResultFact({ ...row, confirmedReportVersion: null }), null)
  assert.equal(
    confirmedResultFact({ ...row, fields: { ...(row.fields as object), _liveReport: true } }),
    null,
  )
})

test('unknown/missing result rules never fall back to the demonstration points policy', () => {
  for (const document of [
    null,
    {},
    { results: { points: { win: 3, draw: 1 } } },
    { results: { fairPlay: true } },
  ])
    assert.throws(() => parseResultsRules('rules', document))
})

test('explicit progression mappings validate sources and reject duplicate destination slots', () => {
  const slot = {
    targetMatchId: randomUUID(),
    side: 'HOME',
    source: { type: 'MATCH_WINNER', matchId: randomUUID() },
  }
  const document = { progression: { sourceStageId: randomUUID(), slots: [slot] } }
  assert.equal(parseProgressionRules(document).slots[0]?.source.type, 'MATCH_WINNER')
  assert.throws(
    () => parseProgressionRules({ progression: { ...document.progression, slots: [slot, slot] } }),
    /DUPLICATE_PROGRESSION_MAPPING/,
  )
  assert.throws(() =>
    parseProgressionRules({
      progression: {
        ...document.progression,
        slots: [{ ...slot, source: { type: 'NAME', name: 'a' } }],
      },
    }),
  )
})
