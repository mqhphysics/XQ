import assert from 'node:assert/strict'
import test from 'node:test'
import { MatchReportService } from './match-report.service'
import type { AuthService, AuthenticatedSession } from '../auth/auth.service'
import type { PrismaService } from '../database/prisma.service'
import type { Prisma } from '../generated/prisma/client'

const org = '10000000-0000-4000-8000-000000000001'
const tournament = '20000000-0000-4000-8000-000000000001'
const match = '30000000-0000-4000-8000-000000000001'
async function permissions(
  role: string,
  scopeType: string,
  scopeId: string,
  reporterStatus = 'ACTIVE',
) {
  const tx = {
    organizationMembership: { findFirst: async () => ({ id: 'active-member' }) },
    roleAssignment: {
      findMany: async () => [{ role, scopeType, scopeId, grantedAt: new Date(0) }],
    },
    match: { findFirst: async () => ({ id: match, tournamentId: tournament }) },
    tournament: { findFirst: async () => ({ id: tournament }) },
    reporterProfile: {
      findUnique: async () => ({
        id: 'profile',
        organizationId: org,
        status: reporterStatus,
        activitySince: new Date(0),
      }),
    },
    season: { findMany: async () => [] },
  } as unknown as Prisma.TransactionClient
  const service = new MatchReportService({} as PrismaService, {} as AuthService)
  const privilege = Reflect.get(service, 'privilege').bind(service) as (
    tx: Prisma.TransactionClient,
    session: AuthenticatedSession,
    match: { id: string; tournamentId: string },
  ) => Promise<{ administrator: boolean; inlineEditor: boolean; reporterReason: string | null }>
  return privilege(
    tx,
    {
      organizationId: org,
      userId: 'owner',
      user: { roles: [] },
    } as unknown as AuthenticatedSession,
    { id: match, tournamentId: tournament },
  )
}
test('platform, organization and scoped tournament administrators can edit without a reporter appointment', async () => {
  for (const [role, scope, id] of [
    ['PLATFORM_ADMIN', 'PLATFORM', org],
    ['ORGANIZATION_ADMIN', 'ORGANIZATION', org],
    ['TOURNAMENT_ADMIN', 'TOURNAMENT', tournament],
  ]) {
    const result = await permissions(role!, scope!, id!)
    assert.equal(result.administrator, true)
    assert.equal(result.inlineEditor, true)
  }
})
test('reporter permissions remain limited to the assigned tournament or match', async () => {
  const reporter = await permissions('MATCH_REPORTER', 'MATCH', match)
  assert.equal(reporter.administrator, false)
  assert.equal(reporter.inlineEditor, true)
  await assert.rejects(
    permissions('MATCH_REPORTER', 'MATCH', '30000000-0000-4000-8000-000000000002'),
  )
  await assert.rejects(
    permissions('TOURNAMENT_ADMIN', 'TOURNAMENT', '20000000-0000-4000-8000-000000000002'),
  )
})

test('a frozen reporter is identified separately from scoped read permission', async () => {
  const result = await permissions('MATCH_REPORTER', 'MATCH', match, 'FROZEN')
  assert.equal(result.administrator, false)
  assert.match(result.reporterReason || '', /冻结/)
})
