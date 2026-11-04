import assert from 'node:assert/strict'
import test from 'node:test'
import type { AuthUser } from '../../features/product/product.types.ts'
import { nativeIdentityKinds } from './identity-panels.logic.weapp.ts'
const user = {
  linkedPlayer: null,
  verificationLevel: 'STUDENT_VERIFIED',
  roles: [],
} as unknown as AuthUser
test('my identities only offers player and reporter, combining captain and player', () => {
  assert.deepEqual(
    nativeIdentityKinds({
      ...user,
      roles: [{ role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM', scopeId: 'platform' }],
    }),
    ['reporter'],
  )
  assert.deepEqual(nativeIdentityKinds(user, ['student', 'coach', 'operator', 'admin']), [])
  assert.deepEqual(nativeIdentityKinds(user, ['player', 'captain', 'reporter']), [
    'player',
    'reporter',
  ])
  assert.deepEqual(
    nativeIdentityKinds({
      ...user,
      roles: [{ role: 'TEAM_CAPTAIN', scopeType: 'TEAM', scopeId: 'team' }],
    }),
    ['player'],
  )
  assert.deepEqual(
    nativeIdentityKinds({
      ...user,
      roles: [{ role: 'MATCH_REPORTER', scopeType: 'TOURNAMENT', scopeId: 'cup' }],
    }),
    ['reporter'],
  )
})
