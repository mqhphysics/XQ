import assert from 'node:assert/strict'
import test from 'node:test'

import { type ConfirmedRevision } from './match-report-handler'
import { buildResultProjectionPayload } from './projection-payload'

const revision: ConfirmedRevision = {
  organizationId: 'FICTIONAL_TEST_ORG',
  matchId: 'match',
  tournamentId: 'cup',
  stageId: 'stage',
  groupId: null,
  homeTeamId: 'a',
  awayTeamId: 'b',
  playedAt: new Date('2026-10-01T10:00:00Z'),
  version: 2,
  revisionId: 'revision',
  ruleVersionId: 'rules',
  status: 'CONFIRMED',
  fields: {
    outcome: 'FINISHED',
    homeScore: '2',
    awayScore: '2',
    homePenaltyScore: '5',
    awayPenaltyScore: '4',
    notes: 'FICTIONAL_PRIVATE_NOTES',
    createdByUserId: 'PRIVATE_AUTHOR',
    events: [],
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
}

test('safe projection normalizes digits and dates, keeps shoot-out separate and omits raw fields', () => {
  const payload = buildResultProjectionPayload(revision)
  assert.equal(payload.homeScore, 2)
  assert.equal(payload.homePenaltyScore, 5)
  assert.equal(payload.playedAt, '2026-10-01T10:00:00.000Z')
  assert.equal(payload.ruleVersionId, 'rules')
  assert.equal(payload.revision, 2)
  assert.equal(payload.notes, undefined)
  assert.equal(payload.fields, undefined)
  assert.equal(payload.createdByUserId, undefined)
  assert.equal(JSON.stringify(payload).includes('PRIVATE'), false)
})

test('abandoned reports project as VOID and retain no invented forfeit decision', () => {
  const payload = buildResultProjectionPayload({
    ...revision,
    fields: {
      ...(revision.fields as object),
      outcome: 'ABANDONED',
      homeScore: '',
      awayScore: '',
      homePenaltyScore: '',
      awayPenaltyScore: '',
    },
  })
  assert.equal(payload.status, 'VOID')
  assert.equal(payload.decision, 'PLAYED')
  assert.equal(payload.homeScore, null)
})

test('malformed confirmed data fails before writing a projection', () => {
  for (const fields of [
    [],
    { outcome: 'UNKNOWN' },
    { outcome: 'FINISHED', homeScore: '-1', awayScore: '0' },
    { outcome: 'FINISHED', homeScore: '2147483648', awayScore: '0' },
    {
      outcome: 'FINISHED',
      homeScore: '2',
      awayScore: '1',
      homePenaltyScore: '5',
      awayPenaltyScore: '4',
    },
  ]) {
    assert.throws(() => buildResultProjectionPayload({ ...revision, fields }))
  }
  assert.throws(() => buildResultProjectionPayload({ ...revision, playedAt: 'broken' }))
})

test('forfeit projection uses the confirmation-bound award and never invents a default policy', () => {
  const forfeit = {
    ...revision,
    fields: {
      ...(revision.fields as object),
      outcome: 'HOME_FORFEIT',
      homeScore: '0',
      awayScore: '3',
      homePenaltyScore: '',
      awayPenaltyScore: '',
    },
  }
  assert.throws(() => buildResultProjectionPayload(forfeit), /FORFEIT_RULES_REQUIRED/)
  const payload = buildResultProjectionPayload({
    ...forfeit,
    resultRules: { forfeit: { winnerGoals: 3, loserGoals: 0, both: null } },
  })
  assert.equal(payload.homeScore, 0)
  assert.equal(payload.awayScore, 3)
  assert.throws(
    () =>
      buildResultProjectionPayload({
        ...forfeit,
        fields: { ...forfeit.fields, homeScore: '9' },
        resultRules: { forfeit: { winnerGoals: 3, loserGoals: 0, both: null } },
      }),
    /FORFEIT_SCORE_MISMATCH/,
  )
})

test('a changed match context refuses the old frozen report instead of repointing its result', () => {
  assert.throws(
    () => buildResultProjectionPayload({ ...revision, groupId: 'changed-group' }),
    /CONFIRMED_MATCH_CONTEXT_CHANGED/,
  )
  assert.throws(
    () => buildResultProjectionPayload({ ...revision, scheduledStartAt: new Date() }),
    /CONFIRMED_MATCH_CONTEXT_CHANGED/,
  )
})
