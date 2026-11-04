import assert from 'node:assert/strict'
import test from 'node:test'
import { fixedCaptainFacts, matchOfficials } from './official-personnel'

const team='00000000-0000-4000-8000-000000000010', player='00000000-0000-4000-8000-000000000011'
test('fixed captains require a stable current same-team player, independent of lineups or accounts', async () => {
  const tx = {
    auditLog: { findMany: async ({ where }: any) => {
      assert.equal(where.organizationId, 'org'); assert.equal(where.action, 'TEAM_FIXED_CAPTAIN_CONFIRMED')
      return [{ id: 'new', targetId: team, afterSummary: { teamId: team, playerId: player } },
        { id: 'old', targetId: team, afterSummary: { teamId: team, playerId: 'wrong' } }]
    } },
    teamMembership: { findMany: async ({ where }: any) => {
      assert.equal(where.organizationId, 'org'); assert.equal(where.status, 'ACTIVE')
      return [{ teamId: team, playerProfileId: player }]
    } },
  } as any
  assert.deepEqual(await fixedCaptainFacts(tx, 'org'), [{ teamId: team, playerId: player, matchId: null, auditId: 'new' }])
  tx.teamMembership.findMany = async () => []
  assert.deepEqual(await fixedCaptainFacts(tx, 'org'), [])
})
test('public officials expose names and existing player links, excluding student identity data and unresolved entries', async () => {
  const student='00000000-0000-4000-8000-000000000012'
  const tx = {
    auditLog: { findFirst: async () => ({ afterSummary: { matchId: 'match', officials: [
      { role: 'REFEREE', studentRecordId: student, studentNumber: 'private' },
      { role: 'FOURTH_OFFICIAL', studentRecordId: null, name: '未确认' },
    ] } }) },
    studentRecord: { findMany: async ({ where }: any) => {
      assert.equal(where.organizationId, 'org'); return [{ id: student, realName: '虚构裁判', player: null }]
    } },
  } as any
  assert.deepEqual(await matchOfficials(tx, 'org', 'match'), [{ role: 'REFEREE', displayName: '虚构裁判', playerId: null }])
})
