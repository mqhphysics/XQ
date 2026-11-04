import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildProductConfiguration } from './product-config.service'
import { modulesForRoute, ProductModuleGuard } from './product-module.guard'
import { ApiHttpException } from '../common/api-http.exception'
import type { ExecutionContext } from '@nestjs/common'
import type { ProductConfigService } from './product-config.service'

test('anonymous configuration is fixed eight-a-side, exposes implemented modules and opens guest reads', () => {
  const config = buildProductConfiguration({
    XIAOQIU_FEATURE_GUEST: 'true',
    XIAOQIU_FEATURE_IDENTITY_APPLICATIONS: 'true',
    XIAOQIU_FEATURE_GOAL_MEDIA: '1',
    DEFAULT_ORGANIZATION_ID: 'private-org',
    DATABASE_URL: 'private-database',
  })
  assert.deepEqual(config.sport, { format: 'EIGHT_A_SIDE', playersPerSide: 8 })
  assert.equal(config.accountRequired, false)
  assert.equal(config.serverGuestAccess, true)
  assert.deepEqual(config.guest, { visible: true, enabled: true, reason: null })
  assert.equal(config.modules.identityApplications.enabled, true)
  assert.equal(config.modules.goalMedia.enabled, true)
  assert.equal(JSON.stringify(config).includes('private-'), false)
})

test('module revision is stable, honors explicit server switches and closes invalid values', () => {
  const defaults = buildProductConfiguration({})
  assert.equal(defaults.revision, buildProductConfiguration({ UNRELATED: 'anything' }).revision)
  for (const value of ['0', 'false', 'FALSE', 'invalid', 'enabled']) {
    const disabled = buildProductConfiguration({ XIAOQIU_FEATURE_COMMUNITY: value })
    assert.equal(disabled.modules.community.enabled, false)
    assert.notEqual(disabled.revision, defaults.revision)
  }
  for (const value of ['1', 'true', 'TRUE', ''])
    assert.equal(
      buildProductConfiguration({ XIAOQIU_FEATURE_COMMUNITY: value }).modules.community.enabled,
      true,
    )
})

test('registered route mapping covers actual module endpoints and leaves authentication/config/health intact', () => {
  const routes: Array<[string, string[]]> = [
    ['/api/public/home/', ['home']],
    ['public/seasons', ['schedule']],
    ['public/tournaments/:id/schedule', ['schedule']],
    ['public/matches/:matchId/experience', ['schedule']],
    ['public/tournaments/:tournamentId/competition-data', ['data']],
    ['public/teams/:teamId/dashboard', ['teams']],
    ['public/tournaments/:tournamentId/teams/:teamId', ['teams']],
    ['public/posts/:postId', ['community']],
    ['community/posts/:postId/comments', ['community']],
    ['matches/:matchId/reviews', ['community']],
    ['captain/teams/:teamId/lineup-plans/:planId/revisions', ['teamManagement']],
    ['captain/teams/:teamId/lineup-plans/:planId/default', ['teamManagement']],
    ['captain/teams/:teamId/lineup-plans/:planId/confirm', ['teamManagement']],
    ['captain/teams/:teamId/members/:membershipId', ['teamManagement']],
    ['roster/tournaments/:tournamentId/teams/:teamId/commands', ['teamManagement']],
    ['matches/:matchId/report/history', ['matchReporting']],
    ['messages/direct/:recipientUserId', ['directMessages']],
    ['admin/center/posts/:id', ['administration', 'community']],
    ['admin/tournaments/:tournamentId/team-registrations/:registrationId', ['administration']],
    ['me/identity', ['identityApplications']],
    ['me/identity/confirm', ['identityApplications']],
    ['me/identity/applications', ['identityApplications']],
    ['admin/identity/records/:id/revoke', ['administration', 'identityApplications']],
    ['admin/identity/records/:id/verify-user', ['administration', 'identityApplications']],
    ['admin/identity/applications/:id/review', ['administration', 'identityApplications']],
  ]
  for (const [path, expected] of routes) assert.deepEqual(modulesForRoute(path), expected, path)
  for (const path of [
    'health',
    'health/ready',
    'auth/login',
    'auth/register',
    'auth/logout',
    'auth/me',
    'product/config',
    'me/capabilities',
    'media/avatars/:fileName',
    'public/postsevil',
    'admin/unknown',
  ])
    assert.deepEqual(modulesForRoute(path), [], path)
})

test('module guard denies a direct request independently of client button state and uses matched route', () => {
  const config = buildProductConfiguration({ XIAOQIU_FEATURE_COMMUNITY: 'false' })
  const guard = new ProductModuleGuard({ getConfiguration: () => config } as ProductConfigService)
  const context = (route?: string, path = '/api/public/posts') =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ route: route ? { path: route } : undefined, path }),
      }),
    }) as unknown as ExecutionContext
  assert.throws(
    () => guard.canActivate(context('/api/community/posts/:postId/like/')),
    (error: unknown) => error instanceof ApiHttpException && error.getStatus() === 403,
  )
  assert.equal(guard.canActivate(context('auth/login', '/api/community/posts')), true)
  assert.equal(guard.canActivate(context()), true)
})
