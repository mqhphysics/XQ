import assert from 'node:assert/strict'
import test from 'node:test'
import { dispatchGuestEntry, GUEST_ENTRY_ROUTE } from './guest-entry.logic.ts'
import { parseProductConfiguration } from './product-config.logic.ts'

const configuration = {
  schemaVersion: 1,
  revision: 'test',
  accountRequired: false,
  serverGuestAccess: true,
  guest: { visible: true, enabled: true },
  sport: { format: 'EIGHT_A_SIDE', playersPerSide: 8 },
  modules: {},
}

test('the same future-enabled guest entry dispatches the real home route without creating a session', async () => {
  const routes: Array<{ url: string }> = []
  const notices: string[] = []
  const policy = parseProductConfiguration(configuration).guest
  assert.equal(
    await dispatchGuestEntry(
      policy,
      async (options) => {
        routes.push(options)
      },
      (message) => {
        notices.push(message)
      },
    ),
    true,
  )
  assert.deepEqual(routes, [{ url: GUEST_ENTRY_ROUTE }])
  assert.equal(GUEST_ENTRY_ROUTE, '/pages/index/index')
  assert.deepEqual(notices, [])
})

test('inconsistent or currently closed configuration explains availability and never dispatches', async () => {
  for (const input of [
    { ...configuration, accountRequired: true },
    { ...configuration, serverGuestAccess: false },
    { ...configuration, guest: { visible: true, enabled: false } },
    {
      ...configuration,
      accountRequired: true,
      serverGuestAccess: false,
      guest: { visible: true, enabled: false },
    },
  ]) {
    let dispatches = 0
    const notices: string[] = []
    assert.equal(
      await dispatchGuestEntry(
        parseProductConfiguration(input).guest,
        async () => {
          dispatches++
        },
        (message) => {
          notices.push(message)
        },
      ),
      false,
    )
    assert.equal(dispatches, 0)
    assert.deepEqual(notices, ['功能暂未开放'])
  }
})
