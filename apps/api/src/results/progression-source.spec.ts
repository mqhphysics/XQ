import assert from 'node:assert/strict'
import test from 'node:test'

import { progressionSourceHash, type ProgressionSource } from './progression-source'

const source: ProgressionSource = {
  organizationId: 'FICTIONAL_TEST_ORG',
  tournamentId: 'cup',
  stageId: 'groups',
  ruleVersionId: 'rules-v1',
  teams: [
    { teamId: 'a', groupId: 'group-a' },
    { teamId: 'b', groupId: 'group-a' },
    { teamId: 'c', groupId: 'group-b' },
    { teamId: 'd', groupId: 'group-b' },
  ],
  matches: [
    {
      matchId: 'ab',
      confirmedReportVersion: 1,
      homeTeamId: 'a',
      awayTeamId: 'b',
      groupId: 'group-a',
    },
    {
      matchId: 'cd',
      confirmedReportVersion: 0,
      homeTeamId: 'c',
      awayTeamId: 'd',
      groupId: 'group-b',
    },
  ],
}

test('source fingerprint is independent of fixture input order without mutating facts', () => {
  const reversed = [...source.matches].reverse()
  assert.equal(
    progressionSourceHash(source),
    progressionSourceHash({ ...source, matches: reversed, teams: [...source.teams].reverse() }),
  )
  assert.equal(reversed[0]?.matchId, 'cd')
})

test('confirmation correction and adding an unconfirmed fixture invalidate an old preview', () => {
  const original = progressionSourceHash(source)
  assert.notEqual(
    original,
    progressionSourceHash({
      ...source,
      matches: source.matches.map((match) =>
        match.matchId === 'ab' ? { ...match, confirmedReportVersion: 2 } : match,
      ),
    }),
  )
  assert.notEqual(
    original,
    progressionSourceHash({
      ...source,
      teams: [...source.teams, { teamId: 'e', groupId: 'group-a' }],
    }),
  )
  assert.notEqual(
    original,
    progressionSourceHash({
      ...source,
      matches: [
        ...source.matches,
        {
          matchId: 'ef',
          confirmedReportVersion: 0,
          homeTeamId: 'e',
          awayTeamId: 'f',
          groupId: 'group-c',
        },
      ],
    }),
  )
})

test('organization, tournament, stage, rules and changed participants/group all affect the fingerprint', () => {
  const original = progressionSourceHash(source)
  for (const key of ['organizationId', 'tournamentId', 'stageId', 'ruleVersionId'] as const) {
    assert.notEqual(original, progressionSourceHash({ ...source, [key]: 'different' }))
  }
  for (const key of ['homeTeamId', 'awayTeamId', 'groupId'] as const) {
    assert.notEqual(
      original,
      progressionSourceHash({
        ...source,
        matches: source.matches.map((match) => ({ ...match, [key]: 'different' })),
      }),
    )
  }
})

test('duplicate source fixtures or invalid versions cannot silently change the hash', () => {
  assert.throws(
    () => progressionSourceHash({ ...source, matches: [source.matches[0]!, source.matches[0]!] }),
    /DUPLICATE_PROGRESSION_SOURCE/,
  )
  assert.throws(
    () => progressionSourceHash({ ...source, teams: [source.teams[0]!, source.teams[0]!] }),
    /DUPLICATE_PROGRESSION_TEAM/,
  )
  assert.throws(
    () =>
      progressionSourceHash({
        ...source,
        matches: [{ ...source.matches[0]!, confirmedReportVersion: -1 }],
      }),
    /INVALID_RESULT_REVISION/,
  )
})
