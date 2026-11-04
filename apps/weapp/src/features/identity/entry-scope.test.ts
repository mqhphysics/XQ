import assert from 'node:assert/strict'
import test from 'node:test'
import { canReportMatch, managedTeamIds } from './entry-scope.ts'

test('report selection requires a real matching object scope and never treats TEAM as a report grant', () => {
  const match = { id: 'match-one', tournamentId: 'cup-one' }
  for (const scope of [
    { type: 'MATCH' as const, id: 'match-one' },
    { type: 'TOURNAMENT' as const, id: 'cup-one' },
    { type: 'ORGANIZATION' as const, id: 'organization-one' },
  ])
    assert.equal(
      canReportMatch({ enabled: true, reason: null, scopes: [scope] }, 'organization-one', match),
      true,
    )
  for (const scope of [
    { type: 'MATCH' as const, id: 'match-two' },
    { type: 'TOURNAMENT' as const, id: 'cup-two' },
    { type: 'ORGANIZATION' as const, id: 'organization-two' },
    { type: 'TEAM' as const, id: 'match-one' },
  ])
    assert.equal(
      canReportMatch({ enabled: true, reason: null, scopes: [scope] }, 'organization-one', match),
      false,
    )
  assert.equal(
    canReportMatch(
      { enabled: false, reason: 'closed', scopes: [{ type: 'MATCH', id: match.id }] },
      'organization-one',
      match,
    ),
    false,
  )
})

test('captain workspace entries only use explicit TEAM scopes; organization administration is a separate entry', () => {
  assert.deepEqual(
    managedTeamIds({
      enabled: true,
      reason: null,
      scopes: [
        { type: 'ORGANIZATION', id: 'organization-one' },
        { type: 'TEAM', id: 'team-one' },
        { type: 'TEAM', id: 'team-one' },
      ],
    }),
    ['team-one'],
  )
  assert.deepEqual(managedTeamIds(undefined), [])
  assert.deepEqual(
    managedTeamIds({
      enabled: false,
      reason: 'closed',
      scopes: [{ type: 'TEAM', id: 'team-one' }],
    }),
    [],
  )
})
