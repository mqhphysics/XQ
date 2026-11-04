import assert from 'node:assert/strict'
import test from 'node:test'

import {
  OutboxConsumer,
  retryDelay,
  type ConsumerOptions,
  type OutboxHandler,
} from './outbox-consumer'
import {
  LostLeaseError,
  PermanentJobError,
  type ClaimedJob,
  type OutboxStore,
  type SqlExecutor,
} from './outbox-store'

const options: ConsumerOptions = {
  concurrency: 2,
  leaseMs: 30000,
  transactionTimeoutMs: 10000,
  retryBaseMs: 100,
  retryMaxMs: 1000,
}
const job: ClaimedJob = {
  id: 'test-job',
  organizationId: 'FICTIONAL_TEST_ORG',
  topic: 'test-results',
  eventType: 'TEST',
  aggregateType: 'TEST',
  aggregateId: 'test-match',
  payload: {},
  attemptCount: 1,
  maxAttempts: 3,
  lockedBy: 'test-token',
}
const tx: SqlExecutor = { query: async () => [] }

// Controlled service tests only; PostgreSQL behavior is tested separately.
class ControlledStore implements OutboxStore {
  claims = 0
  completions = 0
  failures: Array<{ code: string; permanent: boolean; delay: number }> = []
  available: ClaimedJob[] = []
  completeError: Error | undefined
  async claim(topics: string[]): Promise<ClaimedJob | null> {
    this.claims += 1
    assert.deepEqual(topics, ['test-results'])
    return this.available.shift() ?? null
  }
  async complete(current: ClaimedJob, handler: OutboxHandler): Promise<void> {
    if (this.completeError) throw this.completeError
    await handler(tx, current)
    this.completions += 1
  }
  async fail(
    _current: ClaimedJob,
    code: string,
    permanent: boolean,
    delay: number,
  ): Promise<boolean> {
    this.failures.push({ code, permanent, delay })
    return true
  }
}

function consumer(store: OutboxStore, handler: OutboxHandler = async () => {}): OutboxConsumer {
  return new OutboxConsumer(store, new Map([['test-results', handler]]), options)
}

test('bounded concurrency, overlapping ticks join one batch, stop drains all work', async () => {
  const store = new ControlledStore()
  store.available = [job, { ...job, id: 'second' }, { ...job, id: 'third' }]
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const runner = consumer(store, async () => gate)
  const first = runner.tick()
  assert.equal(runner.tick(), first)
  const stopping = runner.stop()
  assert.equal(store.claims, 2)
  release()
  assert.equal(await first, 2)
  await stopping
  assert.equal(await runner.tick(), 0)
  assert.equal(store.available.length, 1)
})

test('transient handler errors retry with a sanitized error code', async () => {
  const store = new ControlledStore()
  store.available = [job]
  const runner = consumer(store, async () => {
    throw new Error('SQL with SECRET and personal information')
  })
  assert.equal(await runner.tick(), 0)
  assert.equal(store.failures[0]?.code, 'OUTBOX_HANDLER_FAILED')
  assert.equal(store.failures[0]?.permanent, false)
  assert.ok(store.failures[0]!.delay >= 50 && store.failures[0]!.delay < 100)
})

test('permanent validation errors do not retry, including organization-less jobs', async () => {
  const store = new ControlledStore()
  store.available = [job]
  await consumer(store, async () => {
    throw new PermanentJobError('INVALID_RESULT_EVENT')
  }).tick()
  assert.equal(store.failures[0]?.permanent, true)
  assert.equal(store.failures[0]?.code, 'INVALID_RESULT_EVENT')
  store.available = [{ ...job, organizationId: null }]
  let called = false
  await consumer(store, async () => {
    called = true
  }).tick()
  assert.equal(called, false)
  assert.equal(store.failures[1]?.code, 'OUTBOX_ORGANIZATION_REQUIRED')
})

test('even a permanent error cannot persist a sensitive freeform message', async () => {
  const store = new ControlledStore()
  store.available = [job]
  await consumer(store, async () => {
    throw new PermanentJobError('secret / user name')
  }).tick()
  assert.deepEqual(
    store.failures.map(({ code, permanent }) => ({ code, permanent })),
    [{ code: 'OUTBOX_HANDLER_FAILED', permanent: true }],
  )
})

test('lost lease does not overwrite a newer attempt with failure', async () => {
  const store = new ControlledStore()
  store.available = [job]
  store.completeError = new LostLeaseError()
  assert.equal(await consumer(store).tick(), 0)
  assert.equal(store.failures.length, 0)
})

test('infrastructure errors settle other active work before rejecting', async () => {
  const store = new ControlledStore()
  store.available = [job, { ...job, id: 'second' }]
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  store.fail = async () => {
    throw new Error('db unreachable')
  }
  const runner = consumer(store, async (_tx, current) => {
    if (current.id === job.id) throw new Error('retry')
    await gate
  })
  const batch = runner.tick()
  let settled = false
  const observed = batch.catch(() => {
    settled = true
  })
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
  assert.equal(settled, false)
  release()
  await assert.rejects(batch, /db unreachable/)
  await observed
  assert.equal(store.completions, 1)
})

test('retry jitter is positive, capped, and validates configuration', () => {
  assert.equal(
    retryDelay(1, 100, 1000, () => 0),
    50,
  )
  assert.equal(
    retryDelay(2, 100, 1000, () => 0.5),
    150,
  )
  assert.equal(
    retryDelay(100000, 100, 1000, () => 0.999),
    999,
  )
  assert.throws(() => retryDelay(0, 100, 1000), /INVALID/)
  assert.throws(() => retryDelay(1, 100, 1000, () => 1), /INVALID/)
  assert.throws(() => retryDelay(1, 100, 2147483648), /INVALID/)
  assert.throws(
    () =>
      new OutboxConsumer(new ControlledStore(), new Map([['test-results', async () => {}]]), {
        ...options,
        concurrency: 100,
      }),
    /CONCURRENCY/,
  )
  assert.throws(
    () =>
      new OutboxConsumer(new ControlledStore(), new Map([['test-results', async () => {}]]), {
        ...options,
        leaseMs: 5000,
      }),
    /TIMEOUT/,
  )
})
