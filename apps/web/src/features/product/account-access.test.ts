import assert from 'node:assert/strict'
import test from 'node:test'

import { isAccountEntryRoute, isUsableStoredSession } from './account-access.ts'

const session = {
  accessToken: 'fictional-test-token',
  expiresAt: '2030-01-01T00:00:00.000Z',
  user: { id: 'fictional-account', organizationId: 'fictional-organization' },
}

test('guest flags, legacy storage and malformed or expired sessions never grant account access', () => {
  for (const value of [
    true,
    { guest: true },
    null,
    {},
    { ...session, accessToken: '' },
    { ...session, accessToken: 1 },
    { ...session, expiresAt: 'invalid' },
    { ...session, expiresAt: '2000-01-01T00:00:00.000Z' },
    { ...session, user: {} },
  ]) {
    assert.equal(isUsableStoredSession(value, Date.parse('2026-10-04')), false)
  }
  assert.equal(isUsableStoredSession(session, Date.parse('2026-10-04')), true)
})

test('only the account entry is accessible before authentication, including deep links', () => {
  for (const route of ['', '/', '#/pages/login/index', '/pages/login/index?preview=art']) {
    assert.equal(isAccountEntryRoute(route), true)
  }
  for (const route of [
    '#/pages/index/index',
    '#/pages/readonly-match-detail/index?matchId=fictional',
    '/pages/player-detail/index',
    '/pages/quick-report/index',
    '/pages/login/index/anything',
  ]) {
    assert.equal(isAccountEntryRoute(route), false)
  }
})
