import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { AccessPolicyService } from '../auth/access-policy.service'
import type { AuthenticatedSession, AuthService } from '../auth/auth.service'
import type { AuthRoleDto } from '../auth/auth.dto'
import { ApiHttpException } from '../common/api-http.exception'
import type { RequestWithId } from '../common/request-context'
import type { PrismaService } from '../database/prisma.service'
import { AccountCapabilitiesService } from './account-capabilities.service'
import { buildProductConfiguration } from './product-config.service'
import type { ProductConfigService } from './product-config.service'

const organizationId = '00000000-0000-4000-8000-000000000091'
const otherOrganizationId = '00000000-0000-4000-8000-000000000092'
const teamId = '00000000-0000-4000-8000-000000000093'
const foreignTeamId = '00000000-0000-4000-8000-000000000094'
const tournamentId = '00000000-0000-4000-8000-000000000095'
const matchId = '00000000-0000-4000-8000-000000000096'
const headers = (value: Record<string, string> = {}) => ({ headers: value }) as RequestWithId

function fixture(roles: AuthRoleDto[] = [], environment: Record<string, string> = {}) {
  let sessionCalls = 0
  let roleQuery: unknown
  const actor = {
    sessionId: 'session',
    userId: 'user',
    organizationId,
    user: { roles: [] },
  } as unknown as AuthenticatedSession
  const prisma = {
    roleAssignment: {
      findMany: async (query: unknown) => {
        roleQuery = query
        return roles
      },
    },
    team: {
      findMany: async () => [{ id: teamId }],
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        where.id === teamId && where.organizationId === organizationId ? { id: teamId } : null,
    },
    tournament: {
      findMany: async () => [{ id: tournamentId }],
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        where.id === tournamentId && where.organizationId === organizationId
          ? { id: tournamentId }
          : null,
    },
    match: {
      findMany: async () => [{ id: matchId, tournamentId }],
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        where.id === matchId && where.organizationId === organizationId
          ? { id: matchId, tournamentId }
          : null,
    },
  } as unknown as PrismaService
  const auth = {
    requireSession: async (authorization: string | undefined) => {
      sessionCalls++
      if (authorization !== 'valid-test-session')
        throw new ApiHttpException(HttpStatus.UNAUTHORIZED, {
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'session rejected',
        })
      return actor
    },
  } as unknown as AuthService
  const service = new AccountCapabilitiesService(auth, prisma, new AccessPolicyService(prisma), {
    getConfiguration: () => buildProductConfiguration(environment),
  } as ProductConfigService)
  return { service, sessionCalls: () => sessionCalls, roleQuery: () => roleQuery }
}

test('capabilities require a freshly valid session; forged role/organization headers do not grant privileges', async () => {
  const current = fixture()
  for (const token of [undefined, 'revoked-test-session'])
    await assert.rejects(
      current.service.get(token, headers({ 'x-dev-role': 'PLATFORM_ADMIN' })),
      (error: unknown) => error instanceof ApiHttpException && error.getStatus() === 401,
    )
  await assert.rejects(
    current.service.get(
      'valid-test-session',
      headers({ 'x-organization-id': otherOrganizationId }),
    ),
    (error: unknown) => error instanceof ApiHttpException && error.getStatus() === 403,
  )
  const result = await current.service.get(
    'valid-test-session',
    headers({ 'x-dev-role': 'PLATFORM_ADMIN' }),
  )
  assert.equal(result.actions['home.read'].enabled, true)
  for (const action of [
    'teams.manage',
    'lineups.manage',
    'matchReports.write',
    'administration.manage',
    'goalMedia.publish',
  ] as const)
    assert.equal(result.actions[action].enabled, false, action)
  assert.equal(result.actions['messages.send'].enabled, true)
  assert.equal(current.sessionCalls(), 4)
  const where = (current.roleQuery() as { where: Record<string, unknown> }).where
  assert.equal(where.revokedAt, null)
  assert.ok((where.grantedAt as { lte: unknown }).lte instanceof Date)
  assert.deepEqual(where.OR, [
    { organizationId },
    { organizationId: null, role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM' },
  ])
})

test('actual object policy keeps captain, reporter and tournament administrator scopes separate', async () => {
  const current = fixture([
    { role: 'TEAM_CAPTAIN', scopeType: 'TEAM', scopeId: teamId },
    { role: 'TEAM_CAPTAIN', scopeType: 'TEAM', scopeId: foreignTeamId },
    { role: 'MATCH_REPORTER', scopeType: 'MATCH', scopeId: matchId },
  ])
  const result = await current.service.get('valid-test-session', headers())
  assert.deepEqual(result.actions['teams.manage'].scopes, [{ type: 'TEAM', id: teamId }])
  assert.deepEqual(result.actions['lineups.manage'].scopes, [{ type: 'TEAM', id: teamId }])
  assert.deepEqual(result.actions['matchReports.write'].scopes, [{ type: 'MATCH', id: matchId }])
  assert.equal(result.actions['administration.manage'].enabled, false)
  assert.equal(result.actions['tournaments.manage'].enabled, false)
  const tournament = await fixture([
    { role: 'TOURNAMENT_ADMIN', scopeType: 'TOURNAMENT', scopeId: tournamentId },
  ]).service.get('valid-test-session', headers())
  assert.deepEqual(tournament.actions['tournaments.manage'].scopes, [
    { type: 'TOURNAMENT', id: tournamentId },
  ])
  assert.deepEqual(tournament.actions['matchReports.write'].scopes, [
    { type: 'TOURNAMENT', id: tournamentId },
  ])
  assert.equal(tournament.actions['teams.manage'].enabled, false)
})

test('administrators respect explicit module switches while ordinary messaging is restored', async () => {
  const result = await fixture(
    [{ role: 'ORGANIZATION_ADMIN', scopeType: 'ORGANIZATION', scopeId: organizationId }],
    { XIAOQIU_FEATURE_TEAM_MANAGEMENT: '0', XIAOQIU_FEATURE_DIRECT_MESSAGES: '0' },
  ).service.get('valid-test-session', headers())
  assert.equal(result.actions['administration.manage'].enabled, true)
  assert.equal(result.actions['messages.send'].enabled, false)
  assert.deepEqual(result.actions['teams.manage'], {
    enabled: false,
    reason: '功能暂未开放',
    scopes: [],
  })
  const platform = await fixture([
    { role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM', scopeId: 'platform' },
  ]).service.get('valid-test-session', headers())
  assert.equal(platform.actions['messages.send'].enabled, true)
})

test('capability snapshots do not retain a revoked team role from an earlier request', async () => {
  const roles = [{ role: 'TEAM_CAPTAIN', scopeType: 'TEAM', scopeId: teamId }]
  const current = fixture(roles)
  assert.equal(
    (await current.service.get('valid-test-session', headers())).actions['teams.manage'].enabled,
    true,
  )
  roles.length = 0
  const refreshed = await current.service.get('valid-test-session', headers())
  assert.deepEqual(refreshed.actions['teams.manage'].scopes, [])
  assert.equal(refreshed.actions['teams.manage'].enabled, false)
  assert.equal(current.sessionCalls(), 2)
})

test('coach capabilities stay scoped while administrators inherit team and lineup operations', async () => {
  const coach = await fixture([
    { role: 'TEAM_COACH', scopeType: 'TEAM', scopeId: teamId },
    { role: 'TEAM_COACH', scopeType: 'TEAM', scopeId: foreignTeamId },
  ]).service.get('valid-test-session', headers())
  assert.deepEqual(coach.managedTeamIds, [teamId])
  assert.deepEqual(coach.actions['lineups.manage'].scopes, [{ type: 'TEAM', id: teamId }])
  assert.equal(coach.actions['identityApplications.review'].enabled, false)
  const administrator = await fixture([
    { role: 'ORGANIZATION_ADMIN', scopeType: 'ORGANIZATION', scopeId: organizationId },
  ]).service.get('valid-test-session', headers())
  assert.deepEqual(administrator.managedTeamIds, [teamId])
  assert.equal(administrator.actions['lineups.manage'].enabled, true)
  assert.deepEqual(administrator.actions['lineups.manage'].scopes, [
    { type: 'ORGANIZATION', id: organizationId },
    { type: 'TEAM', id: teamId },
  ])
  assert.equal(administrator.actions['teams.manage'].enabled, true)
  assert.deepEqual(administrator.actions['identityApplications.review'].scopes, [
    { type: 'ORGANIZATION', id: organizationId },
  ])
})

test('identity submission is available to authenticated members, review requires real administrator scope and the module switch', async () => {
  const member = await fixture().service.get('valid-test-session', headers())
  assert.equal(member.actions['identityApplications.submit'].enabled, true)
  assert.equal(member.actions['identityApplications.review'].enabled, false)
  const closed = await fixture(
    [{ role: 'ORGANIZATION_ADMIN', scopeType: 'ORGANIZATION', scopeId: organizationId }],
    { XIAOQIU_FEATURE_IDENTITY_APPLICATIONS: 'false' },
  ).service.get('valid-test-session', headers())
  for (const action of ['identityApplications.submit', 'identityApplications.review'] as const)
    assert.deepEqual(closed.actions[action], { enabled: false, reason: '功能暂未开放', scopes: [] })
})
