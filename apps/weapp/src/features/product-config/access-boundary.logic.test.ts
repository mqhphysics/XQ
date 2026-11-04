import assert from 'node:assert/strict'
import test from 'node:test'
import {
  anonymousReadAllowed,
  guestPageAllowed,
  explicitAnonymousAuthRequest,
} from './access-boundary.logic.ts'
import { parseProductConfiguration } from './product-config.logic.ts'

const config = parseProductConfiguration({
  schemaVersion: 1,
  revision: 'future',
  accountRequired: false,
  serverGuestAccess: true,
  guest: { enabled: true },
  sport: { format: 'EIGHT_A_SIDE', playersPerSide: 8 },
  modules: {
    home: { enabled: true },
    schedule: { enabled: true },
    data: { enabled: true },
    teams: { enabled: true },
    community: { enabled: true },
  },
})
const guest = { hasSession: false, needsAccount: false }

test('future guest access accepts only known public pages and module-enabled GET endpoints', () => {
  for (const path of [
    '/public/home',
    '/public/seasons',
    '/public/tournaments',
    '/public/tournaments/test/schedule',
    '/public/tournaments/test/teams',
    '/public/teams/test/dashboard',
    '/public/matches/test/experience',
    '/public/tournaments/test/competition-data',
    '/public/players/test',
    '/public/posts/test',
  ])
    assert.equal(anonymousReadAllowed(path, 'GET', config, guest), true, path)
  for (const path of [
    '/me/team-preferences',
    '/admin/center/overview',
    '/captain/teams/test',
    '/messages/conversations',
    '/public/private',
    '/public/teams/../admin',
    '/public/teams/a%2fb/dashboard',
    '/public/home/',
  ])
    assert.equal(anonymousReadAllowed(path, 'GET', config, guest), false, path)
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
    assert.equal(anonymousReadAllowed('/public/home', method, config, guest), false)
  assert.equal(guestPageAllowed('#/pages/readonly-match-detail/index?id=test', config, guest), true)
  for (const route of [
    '/pages/me/index',
    '/pages/my-team/index',
    '/pages/quick-report/index',
    '/pages/unknown/index',
  ])
    assert.equal(guestPageAllowed(route, config, guest), false)
})

test('missing configuration, closed module, session and account failure all close anonymous entry', () => {
  for (const account of [
    { hasSession: true, needsAccount: true },
    { hasSession: false, needsAccount: true },
  ]) {
    assert.equal(anonymousReadAllowed('/public/home', 'GET', config, account), false)
    assert.equal(guestPageAllowed('/pages/index/index', config, account), false)
  }
  assert.equal(anonymousReadAllowed('/public/home', 'GET', null, guest), false)
  assert.equal(
    anonymousReadAllowed(
      '/public/home',
      'GET',
      { ...config, modules: { ...config.modules, home: { enabled: false, reason: 'closed' } } },
      guest,
    ),
    false,
  )
  assert.equal(explicitAnonymousAuthRequest('/auth/login', 'POST'), true)
  for (const path of ['/me', '/admin', '/captain', '/messages', '/public/home'])
    assert.equal(explicitAnonymousAuthRequest(path, 'POST'), false)
})
