import assert from 'node:assert/strict'
import test from 'node:test'
import type { ScopedCapability } from '../../../../../packages/contracts/src/product-config'
import {
  capabilityAllows,
  parseProductConfiguration,
  runFeatureAction,
} from './product-config.logic.ts'

const configuration = {
  schemaVersion: 1,
  revision: 'test',
  accountRequired: true,
  serverGuestAccess: false,
  guest: { visible: true, enabled: true },
  sport: { format: 'EIGHT_A_SIDE', playersPerSide: 8 },
  modules: {
    home: { enabled: true },
    community: { enabled: false },
    unknownFutureModule: { enabled: true },
  },
}

test('unknown modules, missing flags and a misleading guest flag never open restricted entry points', () => {
  const result = parseProductConfiguration(configuration)
  assert.equal(result.guest.enabled, false)
  assert.equal(result.modules.home.enabled, true)
  assert.equal(result.modules.teams.enabled, false)
  assert.equal(result.modules.community.enabled, false)
  assert.equal('unknownFutureModule' in result.modules, false)
  for (const input of [
    {},
    { ...configuration, schemaVersion: 2 },
    { ...configuration, sport: { format: 'ELEVEN_A_SIDE', playersPerSide: 11 } },
    { ...configuration, accountRequired: 'false' },
    { ...configuration, serverGuestAccess: 'true' },
  ])
    assert.throws(() => parseProductConfiguration(input))
})

test('guest entry is enabled only when all three backend decisions consistently allow it', () => {
  for (const accountRequired of [true, false]) {
    for (const serverGuestAccess of [true, false]) {
      for (const enabled of [true, false]) {
        const result = parseProductConfiguration({
          ...configuration,
          accountRequired,
          serverGuestAccess,
          guest: { visible: true, enabled },
        })
        assert.equal(result.guest.enabled, enabled && serverGuestAccess && !accountRequired)
        assert.equal(result.accountRequired, accountRequired)
        assert.equal(result.serverGuestAccess, serverGuestAccess)
      }
    }
  }
})

test('closed buttons remain clickable, explain availability and never execute the business action', async () => {
  const notifications: string[] = []
  let navigations = 0
  const navigate = () => {
    navigations++
  }
  const notify = (message: string) => {
    notifications.push(message)
  }
  assert.equal(
    await runFeatureAction({ enabled: false, reason: '功能暂未开放' }, navigate, notify),
    false,
  )
  assert.equal(await runFeatureAction(undefined, navigate, notify), false)
  assert.equal(navigations, 0)
  assert.deepEqual(notifications, ['功能暂未开放', '功能暂未开放'])
  assert.equal(await runFeatureAction({ enabled: true, reason: null }, navigate, notify), true)
  assert.equal(navigations, 1)
})

test('an unrelated team grant and absent action cannot enable a scoped button', () => {
  const capability = {
    enabled: true,
    reason: null,
    scopes: [{ type: 'TEAM' as const, id: 'team-a' }],
  }
  assert.equal(capabilityAllows(capability, { type: 'TEAM', id: 'team-a' }), true)
  assert.equal(capabilityAllows(capability, { type: 'TEAM', id: 'team-b' }), false)
  assert.equal(capabilityAllows(capability, { type: 'ORGANIZATION', id: 'team-a' }), false)
  assert.equal(capabilityAllows(undefined, { type: 'TEAM', id: 'team-a' }), false)
  for (const scopes of [undefined, {}, [null], ['TEAM']]) {
    assert.equal(
      capabilityAllows({ enabled: true, scopes } as unknown as ScopedCapability, {
        type: 'TEAM',
        id: 'team-a',
      }),
      false,
    )
  }
})
