import assert from 'node:assert/strict'
import test from 'node:test'
import { AccountRequirement, ConfigurationCache } from './configuration-cache.ts'
import { parseProductConfiguration } from './product-config.logic.ts'

const config = (enabled: boolean) =>
  parseProductConfiguration({
    schemaVersion: 1,
    revision: String(enabled),
    accountRequired: !enabled,
    serverGuestAccess: enabled,
    guest: { enabled },
    sport: { format: 'EIGHT_A_SIDE', playersPerSide: 8 },
    modules: { home: { enabled: true } },
  })

test('memory configuration deduplicates loads and expires permission before its next request', async () => {
  let calls = 0
  let now = 0
  const cache = new ConfigurationCache(
    async () => {
      calls++
      return config(true)
    },
    () => now,
    100,
  )
  const [first, second] = await Promise.all([cache.refresh(), cache.refresh()])
  assert.equal(first, second)
  assert.equal(calls, 1)
  assert.equal(cache.getSnapshot().configuration?.guest.enabled, true)
  now = 100
  assert.equal(cache.getSnapshot().configuration, null)
  await cache.refresh()
  assert.equal(calls, 2)
})

test('a stale in-flight response cannot restore guest permission after invalidation', async () => {
  let finish: (value: ReturnType<typeof config>) => void = () => undefined
  let calls = 0
  const cache = new ConfigurationCache(() =>
    ++calls === 1
      ? new Promise((resolve) => {
          finish = resolve
        })
      : Promise.resolve(config(false)),
  )
  const old = cache.refresh()
  await Promise.resolve()
  cache.invalidate()
  const rejected = assert.rejects(old)
  await cache.refresh()
  finish(config(true))
  await rejected
  assert.equal(cache.getSnapshot().configuration?.guest.enabled, false)
})

test('failed refresh removes previously enabled guest configuration immediately', async () => {
  let fail = false
  const cache = new ConfigurationCache(async () => {
    if (fail) throw new Error('offline')
    return config(true)
  })
  await cache.refresh()
  cache.invalidate()
  assert.equal(cache.getSnapshot().configuration, null)
  fail = true
  await assert.rejects(cache.refresh())
  assert.equal(cache.getSnapshot().phase, 'error')
  assert.equal(cache.getSnapshot().configuration, null)
})

test('expired/revoked account intent persists until explicit user exit', () => {
  const account = new AccountRequirement()
  account.observe(true)
  account.observe(false)
  assert.equal(account.needsAccount(), true)
  account.clearByUser()
  assert.equal(account.needsAccount(), false)
})

test('background revalidation keeps permissions visible until the new answer, and failure still closes them', async () => {
  let finish: (value: ReturnType<typeof config>) => void = () => undefined
  let fail = false
  let calls = 0
  const cache = new ConfigurationCache(() => {
    calls++
    if (calls === 1) return Promise.resolve(config(true))
    if (fail) return Promise.reject(new Error('offline'))
    return new Promise((resolve) => (finish = resolve))
  })
  await cache.refresh()
  const pending = cache.revalidate()
  // No blank "loading" frame while the re-check is in flight.
  assert.equal(cache.getSnapshot().phase, 'ready')
  assert.equal(cache.getSnapshot().configuration?.guest.enabled, true)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(cache.getSnapshot().phase, 'ready')
  finish(config(false))
  await pending
  assert.equal(cache.getSnapshot().configuration?.guest.enabled, false)
  fail = true
  await assert.rejects(cache.revalidate())
  assert.equal(cache.getSnapshot().phase, 'error')
  assert.equal(cache.getSnapshot().configuration, null)
})
