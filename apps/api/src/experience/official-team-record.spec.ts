import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CompetitionRuleError,
  type CompetitionRules,
  type ResultFact,
} from '../results/competition-rules'
import { calculateOfficialTeamRecord } from './official-team-record'

// FICTIONAL_TEST inputs, not an adopted competition regulation.
const rules: CompetitionRules = {
  ruleVersionId: 'FICTIONAL_TEST_RULES',
  points: { win: 5, draw: 2, loss: 1 },
  tieBreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR'],
  headToHead: { criteria: ['POINTS'], reapplyToRemainingTeams: false },
  groupShootout: 'REJECT',
  knockoutShootout: 'ALLOWED',
  forfeit: { winnerGoals: 4, loserGoals: 0, loserPoints: -2, both: null },
}

function fact(id: string, patch: Partial<ResultFact> = {}): ResultFact {
  return {
    id,
    organizationId: 'FICTIONAL_TEST_ORG',
    tournamentId: 'FICTIONAL_TEST_CUP',
    stageId: 'FICTIONAL_TEST_STAGE',
    groupId: null,
    revision: 1,
    status: 'CONFIRMED',
    homeTeamId: 'home',
    awayTeamId: 'away',
    homeScore: 2,
    awayScore: 1,
    playedAt: new Date('2026-10-02T00:00:00Z'),
    decision: 'PLAYED',
    ...patch,
  }
}

function expectCode(work: () => unknown, code: string): void {
  assert.throws(
    work,
    (error: unknown) => error instanceof CompetitionRuleError && error.code === code,
  )
}

test('official team record uses configured win, draw and loss points on both sides', () => {
  const facts = [
    fact('win'),
    fact('loss', { homeTeamId: 'other', awayTeamId: 'home', homeScore: 3, awayScore: 0 }),
    fact('draw', { homeScore: 1, awayScore: 1 }),
  ]
  assert.deepEqual(calculateOfficialTeamRecord('home', facts, rules), {
    played: 3,
    won: 1,
    drawn: 1,
    lost: 1,
    goalsFor: 3,
    goalsAgainst: 5,
    points: 8,
    goalDifference: -2,
  })
})

test('official record excludes void, live, draft, pending review and unrelated matches', () => {
  const facts = [
    fact('official'),
    ...(['VOID', 'LIVE', 'DRAFT', 'PENDING_REVIEW'] as const).map((status) =>
      fact(status, { status, homeScore: null, awayScore: null }),
    ),
    fact('unrelated', { homeTeamId: 'other-home', awayTeamId: 'other-away', homeScore: 99 }),
  ]
  assert.deepEqual(
    calculateOfficialTeamRecord('home', facts, rules),
    calculateOfficialTeamRecord('home', [facts[0]!], rules),
  )
  assert.equal(calculateOfficialTeamRecord('absent', facts, rules).played, 0)
})

for (const decision of ['HOME_FORFEIT', 'AWAY_FORFEIT'] as const) {
  test(`${decision} uses the rule award and loser penalty, not the recorded on-field score`, () => {
    const result = fact('forfeit', { decision, homeScore: 9, awayScore: 8 })
    const winner = decision === 'HOME_FORFEIT' ? 'away' : 'home'
    const loser = decision === 'HOME_FORFEIT' ? 'home' : 'away'
    assert.deepEqual(calculateOfficialTeamRecord(winner, [result], rules), {
      played: 1,
      won: 1,
      drawn: 0,
      lost: 0,
      goalsFor: 4,
      goalsAgainst: 0,
      points: 5,
      goalDifference: 4,
    })
    assert.deepEqual(calculateOfficialTeamRecord(loser, [result], rules), {
      played: 1,
      won: 0,
      drawn: 0,
      lost: 1,
      goalsFor: 0,
      goalsAgainst: 4,
      points: -2,
      goalDifference: -4,
    })
  })
}

test('both forfeiting teams receive a loss and the explicit ruling, rather than a draw', () => {
  const result = fact('both-forfeit', { decision: 'BOTH_FORFEIT' })
  const bothRules = { ...rules, forfeit: { ...rules.forfeit, both: { goals: 0, points: -1 } } }
  for (const teamId of ['home', 'away']) {
    assert.deepEqual(calculateOfficialTeamRecord(teamId, [result], bothRules), {
      played: 1,
      won: 0,
      drawn: 0,
      lost: 1,
      goalsFor: 0,
      goalsAgainst: 0,
      points: -1,
      goalDifference: 0,
    })
  }
  expectCode(
    () => calculateOfficialTeamRecord('home', [result], rules),
    'BOTH_FORFEIT_REQUIRES_RULING',
  )
})

test('shootout winner retains an ordinary-score draw in the team record', () => {
  const result = fact('shootout', {
    homeScore: 2,
    awayScore: 2,
    homePenaltyScore: 5,
    awayPenaltyScore: 4,
  })
  for (const teamId of ['home', 'away']) {
    assert.deepEqual(calculateOfficialTeamRecord(teamId, [result], rules), {
      played: 1,
      won: 0,
      drawn: 1,
      lost: 0,
      goalsFor: 2,
      goalsAgainst: 2,
      points: 2,
      goalDifference: 0,
    })
  }
})

test('duplicate match revisions cannot silently count twice, even in excluded inputs', () => {
  const result = fact('duplicate')
  expectCode(
    () => calculateOfficialTeamRecord('home', [result, { ...result, revision: 2 }], rules),
    'DUPLICATE_RESULT',
  )
  expectCode(
    () =>
      calculateOfficialTeamRecord(
        'home',
        [fact('excluded', { status: 'VOID' }), fact('excluded', { status: 'DRAFT' })],
        rules,
      ),
    'DUPLICATE_RESULT',
  )
})

test('invalid rule configuration and malformed facts are rejected', () => {
  expectCode(
    () => calculateOfficialTeamRecord('home', [], { ...rules, ruleVersionId: '' }),
    'RULE_VERSION_REQUIRED',
  )
  expectCode(
    () =>
      calculateOfficialTeamRecord('home', [], {
        ...rules,
        points: { ...rules.points, win: -1 },
      }),
    'INVALID_POINTS',
  )
  expectCode(
    () => calculateOfficialTeamRecord('home', [fact('same', { awayTeamId: 'home' })], rules),
    'SAME_TEAM_MATCH',
  )
  expectCode(
    () => calculateOfficialTeamRecord('home', [fact('invalid-score', { homeScore: -1 })], rules),
    'INVALID_RESULT_SCORE',
  )
})
