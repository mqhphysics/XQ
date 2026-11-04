import assert from 'node:assert/strict'
import test from 'node:test'
import { AccessPolicyService } from './access-policy.service'
import type { AuthenticatedSession } from './auth.service'
import type { PrismaService } from '../database/prisma.service'

const org = '10000000-0000-4000-8000-000000000001'
const team = '20000000-0000-4000-8000-000000000001'
const tournament = '30000000-0000-4000-8000-000000000001'
const match = '40000000-0000-4000-8000-000000000001'
const other = '50000000-0000-4000-8000-000000000001'
const policy = new AccessPolicyService({
  team: {
    findFirst: async ({ where }: { where: { id: string } }) =>
      where.id === team ? { id: team } : null,
  },
  teamRegistration: {
    findFirst: async ({ where }: { where: { tournamentId: string } }) =>
      where.tournamentId === tournament ? { id: 'registration' } : null,
  },
  tournament: {
    findFirst: async ({ where }: { where: { id: string } }) =>
      where.id === tournament ? { id: tournament } : null,
  },
  match: {
    findFirst: async ({ where }: { where: { id: string } }) =>
      where.id === match ? { id: match, tournamentId: tournament } : null,
  },
} as unknown as PrismaService)
function actor(role: string, scopeType: string, scopeId: string) {
  return {
    organizationId: org,
    user: { roles: [{ role, scopeType, scopeId }] },
  } as unknown as AuthenticatedSession
}

test('a single platform role inherits team, tournament and match operations', async () => {
  const owner = actor('PLATFORM_ADMIN', 'PLATFORM', 'platform')
  policy.requireOrganizationAdministrator(owner)
  await policy.requireTournamentAdministrator(owner, tournament)
  await policy.requireTeamCaptain(owner, team, tournament)
  await policy.requireMatchReporter(owner, match)
  // Administrator inheritance does not turn a foreign object into a local one.
  await assert.rejects(policy.requireTeamCaptain(owner, other), { status: 404 })
  await assert.rejects(policy.requireTeamCaptain(owner, team, other), { status: 404 })
})

test('ordinary scoped staff retain their boundaries', async () => {
  const captain = actor('TEAM_CAPTAIN', 'TEAM', team)
  await policy.requireTeamCaptain(captain, team, tournament)
  await assert.rejects(policy.requireMatchReporter(captain, match), { status: 403 })
  const reporter = actor('MATCH_REPORTER', 'MATCH', match)
  await policy.requireMatchReporter(reporter, match)
  await assert.rejects(policy.requireTeamCaptain(reporter, team), { status: 403 })
  await assert.rejects(policy.requireTournamentAdministrator(reporter, tournament), { status: 403 })
})
