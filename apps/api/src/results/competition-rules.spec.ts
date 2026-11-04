import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CompetitionRuleError,
  type CompetitionRules,
  type ResultFact,
  type ResultScope,
} from './competition-rules'
import { resolveKnockoutResult } from './knockout'
import { adaptReportResult, type ReportResultInput } from './report-adapter'
import { calculateResultStandings, selectGroupQualifiers } from './standings'

const scope: ResultScope = {
  organizationId: 'org',
  tournamentId: 'cup',
  stageId: 'group-stage',
  groupId: 'group-a',
}
// FICTIONAL_TEST rules; never an adopted campus competition regulation.
const rules: CompetitionRules = {
  ruleVersionId: 'FICTIONAL_TEST_RULES_V1',
  points: { win: 3, draw: 1, loss: 0 },
  tieBreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR', 'HEAD_TO_HEAD'],
  headToHead: {
    criteria: ['POINTS', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
    reapplyToRemainingTeams: true,
  },
  groupShootout: 'REJECT',
  knockoutShootout: 'ALLOWED',
  forfeit: { winnerGoals: 3, loserGoals: 0, loserPoints: 0, both: null },
}

function fact(
  id: string,
  homeTeamId = 'a',
  awayTeamId = 'b',
  homeScore = 1,
  awayScore = 0,
  changes: Partial<ResultFact> = {},
): ResultFact {
  return {
    ...scope,
    id,
    revision: 1,
    status: 'CONFIRMED',
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
    playedAt: new Date('2026-10-01T10:00:00Z'),
    decision: 'PLAYED',
    ...changes,
  }
}

function expectCode(work: () => unknown, code: string): void {
  assert.throws(
    work,
    (error: unknown) => error instanceof CompetitionRuleError && error.code === code,
  )
}

test('official and preview tables separate live and pending review facts', () => {
  const facts = [
    fact('official'),
    fact('review', 'b', 'a', 5, 0, { status: 'PENDING_REVIEW' }),
    fact('live', 'a', 'b', 0, 1, { status: 'LIVE' }),
    fact('void', 'a', 'b', 100, 0, { status: 'VOID' }),
  ]
  const official = calculateResultStandings(scope, ['a', 'b'], facts, rules, 'OFFICIAL')
  const preview = calculateResultStandings(scope, ['a', 'b'], facts, rules, 'PREVIEW')
  assert.equal(official.rows[0]?.teamId, 'a')
  assert.equal(official.rows[0]?.played, 1)
  assert.equal(preview.rows[0]?.teamId, 'b')
  assert.equal(preview.rows[0]?.played, 3)
  assert.ok(preview.rows.every((row) => row.provisional))
  assert.ok(official.rows.every((row) => !row.provisional))
  assert.deepEqual(official.excludedMatchIds, ['live', 'review', 'void'])
  assert.equal(selectGroupQualifiers(preview, 1, true).status, 'BLOCKED')
})

test('tied sporting metrics remain tied and block a cutoff', () => {
  const table = calculateResultStandings(scope, ['b', 'a', 'c'], [], rules, 'OFFICIAL')
  assert.deepEqual(
    table.rows.map((row) => row.rank),
    [1, 1, 1],
  )
  assert.deepEqual(selectGroupQualifiers(table, 1, true), {
    status: 'BLOCKED',
    reason: 'UNRESOLVED_CUTOFF',
    teamIds: ['a', 'b', 'c'],
  })
  assert.equal(selectGroupQualifiers(table, 3, true).status, 'READY')
  assert.deepEqual(selectGroupQualifiers(table, 3, false), {
    status: 'BLOCKED',
    reason: 'STAGE_INCOMPLETE',
    teamIds: [],
  })
})

test('head-to-head uses all tied teams as a mini league, independent of input order', () => {
  const facts = [fact('ab', 'a', 'b', 3, 0), fact('bc', 'b', 'c', 2, 0), fact('ca', 'c', 'a', 1, 0)]
  const headFirst = { ...rules, tieBreakers: ['HEAD_TO_HEAD'] as CompetitionRules['tieBreakers'] }
  const table = calculateResultStandings(scope, ['c', 'b', 'a'], facts, headFirst, 'OFFICIAL')
  assert.deepEqual(
    table.rows.map((row) => row.teamId),
    ['a', 'b', 'c'],
  )
  assert.deepEqual(
    table,
    calculateResultStandings(scope, ['a', 'b', 'c'], [...facts].reverse(), headFirst, 'OFFICIAL'),
  )
})

test('head-to-head can reapply to the remaining subset instead of the original mini league', () => {
  const facts = [fact('ab', 'a', 'b', 3, 0), fact('bc', 'b', 'c', 2, 1), fact('ca', 'c', 'a', 3, 1)]
  const headRules = {
    ...rules,
    tieBreakers: ['HEAD_TO_HEAD'] as CompetitionRules['tieBreakers'],
    headToHead: {
      criteria: ['POINTS', 'GOAL_DIFFERENCE'] as CompetitionRules['headToHead']['criteria'],
      reapplyToRemainingTeams: true,
    },
  }
  const table = calculateResultStandings(scope, ['a', 'b', 'c'], facts, headRules, 'OFFICIAL')
  // All have 3 points. In the mini league a,c share +1; direct reapplication favors c.
  assert.deepEqual(
    table.rows.map((row) => row.teamId),
    ['c', 'a', 'b'],
  )
  const withoutReapplication = calculateResultStandings(
    scope,
    ['a', 'b', 'c'],
    facts,
    { ...headRules, headToHead: { ...headRules.headToHead, reapplyToRemainingTeams: false } },
    'OFFICIAL',
  )
  assert.deepEqual(
    withoutReapplication.rows.map((row) => row.rank),
    [1, 1, 3],
  )
})

test('rule order and points are configurable instead of silently adopting demo rules', () => {
  const facts = [fact('ab', 'a', 'b'), fact('ac', 'a', 'c', 0, 2), fact('bc', 'b', 'c', 5, 0)]
  const gdFirst = calculateResultStandings(scope, ['a', 'b', 'c'], facts, rules, 'OFFICIAL')
  const h2hFirst = calculateResultStandings(
    scope,
    ['a', 'b', 'c'],
    facts,
    {
      ...rules,
      tieBreakers: ['HEAD_TO_HEAD'],
      headToHead: { criteria: ['POINTS'], reapplyToRemainingTeams: true },
    },
    'OFFICIAL',
  )
  assert.equal(gdFirst.rows[0]?.teamId, 'b')
  assert.deepEqual(
    h2hFirst.rows.map((row) => row.rank),
    [1, 1, 1],
  )
  const custom = calculateResultStandings(
    scope,
    ['a', 'b'],
    [fact('ab')],
    { ...rules, points: { win: 2, draw: 1, loss: 0 } },
    'OFFICIAL',
  )
  assert.equal(custom.rows[0]?.points, 2)
})

test('shoot-out selects knockout winner without adding shoot-out goals to the group table', () => {
  const match = fact('pens', 'a', 'b', 2, 2, { homePenaltyScore: 4, awayPenaltyScore: 5 })
  const knockout = resolveKnockoutResult(scope, match, rules)
  assert.equal(knockout.status, 'READY')
  if (knockout.status === 'READY') assert.equal(knockout.winnerTeamId, 'b')
  expectCode(
    () => calculateResultStandings(scope, ['a', 'b'], [match], rules, 'OFFICIAL'),
    'GROUP_SHOOTOUT_NOT_ALLOWED',
  )
  const table = calculateResultStandings(
    scope,
    ['a', 'b'],
    [match],
    { ...rules, groupShootout: 'COUNT_AS_DRAW' },
    'OFFICIAL',
  )
  assert.ok(table.rows.every((row) => row.goalsFor === 2 && row.points === 1 && row.drawn === 1))
})

test('knockout requires confirmed facts and a decided winner', () => {
  assert.deepEqual(
    resolveKnockoutResult(
      scope,
      fact('pending', 'a', 'b', 5, 0, { status: 'PENDING_REVIEW' }),
      rules,
    ),
    { status: 'BLOCKED', reason: 'UNCONFIRMED_RESULT' },
  )
  assert.deepEqual(resolveKnockoutResult(scope, fact('draw', 'a', 'b', 1, 1), rules), {
    status: 'BLOCKED',
    reason: 'DRAW_REQUIRES_DECISION',
  })
  const result = resolveKnockoutResult(scope, fact('extra-time', 'a', 'b', 3, 2), rules)
  assert.equal(result.status, 'READY')
  if (result.status === 'READY') assert.equal(result.decidedBy, 'SCORE')
})

test('forfeit uses the explicit award and penalty rather than the on-field score', () => {
  const match = fact('forfeit', 'a', 'b', 8, 0, { decision: 'HOME_FORFEIT' })
  const custom = { ...rules, forfeit: { ...rules.forfeit, loserPoints: -1 } }
  const table = calculateResultStandings(scope, ['a', 'b'], [match], custom, 'OFFICIAL')
  assert.equal(table.rows[0]?.teamId, 'b')
  assert.equal(table.rows[0]?.goalsFor, 3)
  assert.equal(table.rows[1]?.points, -1)
  const winner = resolveKnockoutResult(scope, match, custom)
  if (winner.status === 'READY') assert.equal(winner.decidedBy, 'FORFEIT')
  else assert.fail('forfeit should have a winner')
})

test('both teams forfeiting requires a rule for standings and a ruling for advancement', () => {
  const match = fact('both', 'a', 'b', 0, 0, { decision: 'BOTH_FORFEIT' })
  expectCode(
    () => calculateResultStandings(scope, ['a', 'b'], [match], rules, 'OFFICIAL'),
    'BOTH_FORFEIT_REQUIRES_RULING',
  )
  const table = calculateResultStandings(
    scope,
    ['a', 'b'],
    [match],
    { ...rules, forfeit: { ...rules.forfeit, both: { goals: 0, points: 0 } } },
    'OFFICIAL',
  )
  assert.ok(table.rows.every((row) => row.lost === 1 && row.drawn === 0 && row.points === 0))
  assert.deepEqual(resolveKnockoutResult(scope, match, rules), {
    status: 'BLOCKED',
    reason: 'BOTH_FORFEIT_REQUIRES_RULING',
  })
})

test('correction recalculates from the latest snapshot without accumulating old facts', () => {
  const original = fact('ab')
  const before = calculateResultStandings(scope, ['a', 'b'], [original], rules, 'OFFICIAL')
  const after = calculateResultStandings(
    scope,
    ['a', 'b'],
    [{ ...original, revision: 2, homeScore: 0, awayScore: 2 }],
    rules,
    'OFFICIAL',
  )
  assert.equal(before.rows[0]?.teamId, 'a')
  assert.equal(after.rows[0]?.teamId, 'b')
  assert.ok(after.rows.every((row) => row.played === 1))
  assert.equal(original.homeScore, 1)
  expectCode(
    () =>
      calculateResultStandings(
        scope,
        ['a', 'b'],
        [original, { ...original, revision: 2 }],
        rules,
        'OFFICIAL',
      ),
    'DUPLICATE_RESULT',
  )
})

test('no mutation, deterministic recent form and only the most recent five matches', () => {
  const matches = Array.from({ length: 6 }, (_, index) =>
    fact(`m${index}`, 'a', 'b', index % 2, 0, { playedAt: new Date(1000 * index) }),
  )
  for (const match of matches) Object.freeze(match)
  Object.freeze(matches)
  const table = calculateResultStandings(scope, ['a', 'b'], matches, rules, 'OFFICIAL')
  assert.deepEqual(table.rows[0]?.form, ['W', 'D', 'W', 'D', 'W'])
})

for (const [label, changes, code] of [
  ['cross organization', { organizationId: 'other' }, 'RESULT_SCOPE_MISMATCH'],
  ['cross tournament', { tournamentId: 'other' }, 'RESULT_SCOPE_MISMATCH'],
  ['cross stage', { stageId: 'other' }, 'RESULT_SCOPE_MISMATCH'],
  ['cross group', { groupId: 'other' }, 'RESULT_SCOPE_MISMATCH'],
  ['same team', { awayTeamId: 'a' }, 'SAME_TEAM_MATCH'],
  ['missing score', { homeScore: null }, 'MISSING_RESULT_SCORE'],
  ['negative score', { homeScore: -1 }, 'INVALID_RESULT_SCORE'],
  ['fractional score', { homeScore: 0.5 }, 'INVALID_RESULT_SCORE'],
  ['invalid time', { playedAt: new Date('invalid') }, 'INVALID_MATCH_TIME'],
  ['invalid revision', { revision: 0 }, 'INVALID_RESULT_REVISION'],
  [
    'incomplete shoot-out',
    { homeScore: 1, awayScore: 1, homePenaltyScore: 4 },
    'INCOMPLETE_SHOOTOUT',
  ],
  [
    'tied shoot-out',
    { homeScore: 1, awayScore: 1, homePenaltyScore: 4, awayPenaltyScore: 4 },
    'UNDECIDED_SHOOTOUT',
  ],
  ['shoot-out after win', { homePenaltyScore: 4, awayPenaltyScore: 3 }, 'SHOOTOUT_REQUIRES_DRAW'],
] as Array<[string, Partial<ResultFact>, string]>) {
  test(`rejects ${label}`, () =>
    expectCode(
      () =>
        calculateResultStandings(
          scope,
          ['a', 'b'],
          [fact('invalid', 'a', 'b', 1, 0, changes)],
          rules,
          'OFFICIAL',
        ),
      code,
    ))
}

test('rejects duplicate teams, unknown opponents and unsupported rules', () => {
  expectCode(
    () => calculateResultStandings(scope, ['a', 'a'], [], rules, 'OFFICIAL'),
    'INVALID_TEAMS',
  )
  expectCode(
    () => calculateResultStandings(scope, ['a', 'b'], [fact('other', 'a', 'c')], rules, 'OFFICIAL'),
    'TEAM_OUTSIDE_GROUP',
  )
  expectCode(
    () =>
      calculateResultStandings(scope, ['a', 'b'], [], { ...rules, ruleVersionId: '' }, 'OFFICIAL'),
    'RULE_VERSION_REQUIRED',
  )
  expectCode(
    () =>
      calculateResultStandings(
        scope,
        ['a', 'b'],
        [],
        { ...rules, tieBreakers: ['GOALS_FOR', 'GOALS_FOR'] },
        'OFFICIAL',
      ),
    'INVALID_TIE_BREAKERS',
  )
})

test('report wire statuses map explicitly and abandoned matches never become forfeits', () => {
  const input: ReportResultInput = {
    ...scope,
    matchId: 'report-match',
    reportVersion: 3,
    reportStatus: 'SUBMITTED',
    outcome: 'FINISHED',
    homeTeamId: 'a',
    awayTeamId: 'b',
    playedAt: new Date(),
    homeScore: 1,
    awayScore: 0,
    homePenaltyScore: null,
    awayPenaltyScore: null,
  }
  assert.equal(adaptReportResult(input).status, 'PENDING_REVIEW')
  assert.equal(adaptReportResult({ ...input, reportStatus: 'RETURNED' }).status, 'DRAFT')
  const confirmed = adaptReportResult({ ...input, reportStatus: 'CONFIRMED' })
  assert.equal(confirmed.revision, 3)
  assert.equal(confirmed.decision, 'PLAYED')
  const abandoned = adaptReportResult({ ...input, reportStatus: 'CONFIRMED', outcome: 'ABANDONED' })
  assert.equal(abandoned.status, 'VOID')
  const table = calculateResultStandings(scope, ['a', 'b'], [abandoned], rules, 'OFFICIAL')
  assert.ok(table.rows.every((row) => row.played === 0))
  assert.deepEqual(resolveKnockoutResult(scope, abandoned, rules), {
    status: 'BLOCKED',
    reason: 'UNCONFIRMED_RESULT',
  })
})
