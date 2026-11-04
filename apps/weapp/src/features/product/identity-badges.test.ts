import assert from 'node:assert/strict'
import test from 'node:test'
import { identityBadgeKinds, identityLabels, displayedBadgeKind } from './identity-badges.ts'

test('badges distinguish captain, information manager and website operations using actual roles', () => {
  assert.deepEqual(
    identityBadgeKinds('PLAYER_CONFIRMED', [
      'TEAM_CAPTAIN',
      'MATCH_REPORTER',
      'ORGANIZATION_ADMIN',
    ]),
    ['operator', 'reporter', 'captain', 'player'],
  )
  assert.deepEqual(identityBadgeKinds('STAFF_VERIFIED', ['TOURNAMENT_ADMIN']), ['admin'])
  assert.deepEqual(identityBadgeKinds('STAFF_VERIFIED'), [])
  assert.deepEqual(identityBadgeKinds('STUDENT_VERIFIED'), ['student'])
  assert.deepEqual(identityBadgeKinds('UNVERIFIED'), [])
  assert.deepEqual(identityBadgeKinds('STAFF_VERIFIED', ['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']), [
    'operator',
  ])
  assert.equal(identityLabels.reporter, '信息管理员')
  assert.equal(identityLabels.captain, '认证队长')
  assert.equal(identityLabels.operator, '网站运营')
})
test('only one badge is displayed; preference must remain in current earned identities', () => {
  assert.equal(displayedBadgeKind('PLAYER_CONFIRMED', ['TEAM_CAPTAIN']), 'captain')
  assert.equal(displayedBadgeKind('PLAYER_CONFIRMED', ['TEAM_CAPTAIN'], false, 'player'), 'player')
  assert.equal(displayedBadgeKind('PLAYER_CONFIRMED', [], false, 'captain'), 'player')
  assert.equal(displayedBadgeKind('STUDENT_VERIFIED', [], false, 'operator'), 'student')
  assert.equal(
    displayedBadgeKind('STAFF_VERIFIED', ['MATCH_REPORTER', 'ORGANIZATION_ADMIN']),
    'operator',
  )
})
