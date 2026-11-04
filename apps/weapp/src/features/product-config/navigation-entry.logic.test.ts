import assert from 'node:assert/strict'
import test from 'node:test'
import type { AccountCapabilities } from '../../../../../packages/contracts/src/product-config'
import { runNavigationEntry, runPrivateEntry } from './navigation-entry.logic.ts'
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
    teamManagement: { enabled: true },
    directMessages: { enabled: true },
  },
})
function fixture(hasSession = false) {
  const notices: string[] = []
  let navigations = 0
  let capabilitiesCalls = 0
  const capabilities = {
    schemaVersion: 1,
    organizationId: 'org',
    modules: { ...config.modules },
    actions: {
      'home.read': { enabled: true, scopes: [{ type: 'ORGANIZATION', id: 'org' }] },
      'teams.manage': { enabled: true, scopes: [{ type: 'TEAM', id: 'team-a' }] },
    },
  } as unknown as AccountCapabilities
  const dependencies = {
    getConfiguration: async () => config,
    account: () => ({
      hasSession,
      needsAccount: hasSession,
      organizationId: hasSession ? 'org' : null,
    }),
    getCapabilities: async () => {
      capabilitiesCalls++
      return capabilities
    },
    navigate: () => {
      navigations++
    },
    notify: (message: string) => {
      notices.push(message)
    },
  }
  return {
    dependencies,
    notices,
    capabilities,
    navigations: () => navigations,
    calls: () => capabilitiesCalls,
  }
}

test('same module button executes enabled route and explains a closed or unknown configuration', async () => {
  const current = fixture()
  assert.equal(await runNavigationEntry('home', current.dependencies), true)
  assert.equal(current.navigations(), 1)
  current.dependencies.getConfiguration = async () => ({
    ...config,
    modules: { ...config.modules, home: { enabled: false, reason: null } },
  })
  assert.equal(await runNavigationEntry('home', current.dependencies), false)
  current.dependencies.getConfiguration = async () => {
    throw new Error('offline')
  }
  assert.equal(await runNavigationEntry('home', current.dependencies), false)
  assert.equal(current.navigations(), 1)
  assert.deepEqual(current.notices, ['功能暂未开放', '功能暂未开放'])
})

test('guest cannot enter private account buttons; account entry revalidates capabilities on each click', async () => {
  const guest = fixture()
  assert.equal(await runNavigationEntry('me', guest.dependencies), false)
  assert.equal(await runPrivateEntry('messages.read', guest.dependencies), false)
  assert.equal(guest.calls(), 0)
  const account = fixture(true)
  assert.equal(await runNavigationEntry('home', account.dependencies), true)
  account.capabilities.actions['home.read'].enabled = false
  assert.equal(await runNavigationEntry('home', account.dependencies), false)
  assert.equal(account.calls(), 2)
  assert.equal(account.navigations(), 1)
})

test('private role button requires its exact object scope and refuses an organization switch', async () => {
  const account = fixture(true)
  assert.equal(
    await runPrivateEntry('teams.manage', account.dependencies, { type: 'TEAM', id: 'team-a' }),
    true,
  )
  assert.equal(
    await runPrivateEntry('teams.manage', account.dependencies, { type: 'TEAM', id: 'team-b' }),
    false,
  )
  account.dependencies.getCapabilities = async () => {
    account.dependencies.account = () => ({
      hasSession: true,
      needsAccount: true,
      organizationId: 'other-org',
    })
    return account.capabilities
  }
  assert.equal(
    await runPrivateEntry('teams.manage', account.dependencies, { type: 'TEAM', id: 'team-a' }),
    false,
  )
  assert.equal(account.navigations(), 1)
})

test('module closure beats a stale action grant and organization grants never become TEAM scope', async () => {
  const account = fixture(true)
  account.capabilities.actions['teams.manage'].scopes = [{ type: 'ORGANIZATION', id: 'org' }]
  assert.equal(
    await runPrivateEntry('teams.manage', account.dependencies, { type: 'TEAM', id: 'team-a' }),
    false,
  )
  account.dependencies.getConfiguration = async () => ({
    ...config,
    modules: { ...config.modules, teamManagement: { enabled: false, reason: null } },
  })
  assert.equal(await runPrivateEntry('teams.manage', account.dependencies), false)
  assert.equal(account.navigations(), 0)
  assert.equal(account.calls(), 1)
})
