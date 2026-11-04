import assert from 'node:assert/strict'
import test from 'node:test'
import { AccountCapabilitiesService } from './account-capabilities.service'
import { AccessPolicyService } from '../auth/access-policy.service'
import type { AuthService, AuthenticatedSession } from '../auth/auth.service'
import type { PrismaService } from '../database/prisma.service'
import type { RequestWithId } from '../common/request-context'
import { ProductConfigService } from './product-config.service'

test('platform-only owner receives managed teams and lineup/report capabilities without extra roles', async () => {
  const organizationId = '10000000-0000-4000-8000-000000000001'
  const teamId = '20000000-0000-4000-8000-000000000001'
  const session = {
    organizationId,
    userId: 'owner',
    user: { roles: [] },
  } as unknown as AuthenticatedSession
  const db = {
    roleAssignment: {
      findMany: async () => [
        { role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM', scopeId: 'platform' },
      ],
    },
    team: {
      findMany: async (query: { where: { id?: unknown } }) => {
        assert.equal(query.where.id, undefined)
        return [{ id: teamId }]
      },
      findFirst: async () => ({ id: teamId }),
    },
    tournament: { findMany: async () => [] },
    match: { findMany: async () => [] },
  } as unknown as PrismaService
  const service = new AccountCapabilitiesService(
    { requireSession: async () => session } as unknown as AuthService,
    db,
    new AccessPolicyService(db),
    new ProductConfigService(),
  )
  const result = await service.get('Bearer test', { headers: {} } as RequestWithId)
  assert.deepEqual(result.managedTeamIds, [teamId])
  for (const action of [
    'teams.manage',
    'lineups.manage',
    'matchReports.write',
    'administration.manage',
    'goalMedia.review',
  ] as const) {
    assert.equal(result.actions[action].enabled, true, action)
  }
})
