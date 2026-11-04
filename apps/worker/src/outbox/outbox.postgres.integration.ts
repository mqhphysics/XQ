import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import test from 'node:test'

import { OutboxConsumer } from './outbox-consumer'
import {
  LostLeaseError,
  PostgresOutboxStore,
  type ClaimedJob,
  type SqlExecutor,
} from './outbox-store'
import { clientLoader, closeTestDatabase, db, prisma } from './postgres-test-client.test'
const store = new PostgresOutboxStore(db)
const ids: string[] = []

async function runChild(
  topic: string,
  mode: 'CLAIM_AND_EXIT' | 'COMPLETE',
): Promise<{ acquired: boolean }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      [
        clientLoader.resolve('tsx/cli'),
        resolve(process.cwd(), 'src/outbox/postgres-child.test.ts'),
      ],
      {
        env: { ...process.env, WORKER_TEST_TOPIC: topic, WORKER_TEST_MODE: mode },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    )
    let output = ''
    child.stdout.on('data', (data) => {
      output += String(data)
    })
    child.stderr.resume()
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('POSTGRES_TEST_CHILD_TIMEOUT'))
    }, 10000)
    child.on('error', () => {
      clearTimeout(timer)
      reject(new Error('POSTGRES_TEST_CHILD_FAILED'))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error('POSTGRES_TEST_CHILD_FAILED'))
      try {
        resolveResult(JSON.parse(output.trim()) as { acquired: boolean })
      } catch {
        reject(new Error('POSTGRES_TEST_CHILD_INVALID_OUTPUT'))
      }
    })
  })
}

async function enqueue(
  topic: string,
  maxAttempts = 3,
  organizationId: string | null = null,
): Promise<string> {
  const id = randomUUID()
  ids.push(id)
  await prisma.$executeRawUnsafe(
    `INSERT INTO outbox_jobs
    (id, organization_id, topic, aggregate_type, aggregate_id, event_type, payload, max_attempts, updated_at)
    VALUES ($1::uuid, $2::uuid, $3, 'FICTIONAL_TEST', 'FICTIONAL_TEST_MATCH', 'FICTIONAL_TEST_EVENT', '{"source":"FICTIONAL_TEST"}'::jsonb, $4, now())`,
    id,
    organizationId,
    topic,
    maxAttempts,
  )
  return id
}

async function state(id: string): Promise<{
  status: string
  attemptCount: number
  code: string | null
  error: string | null
  effects: number
}> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      status: string
      attemptCount: number
      code: string | null
      error: string | null
      effects: number
    }>
  >(
    `SELECT status::text, attempt_count AS "attemptCount", last_error_code AS code, last_error AS error,
    coalesce((SELECT application_count FROM results_worker_test_effects WHERE job_id = outbox_jobs.id), 0) AS effects
    FROM outbox_jobs WHERE id = $1::uuid`,
    id,
  )
  assert.ok(rows[0])
  return rows[0]
}

async function effect(tx: SqlExecutor, job: ClaimedJob): Promise<void> {
  await tx.query(
    `INSERT INTO results_worker_test_effects (job_id, application_count) VALUES ($1::uuid, 1)
    ON CONFLICT (job_id) DO UPDATE SET application_count = results_worker_test_effects.application_count + 1 RETURNING job_id`,
    [job.id],
  )
}

test('real PostgreSQL Outbox claim, fencing, rollback, retries and restart behavior', async (t) => {
  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS results_worker_test_effects (job_id uuid PRIMARY KEY, application_count integer NOT NULL)',
  )
  try {
    await t.test('rejects durations beyond PostgreSQL int4 before executing SQL', async () => {
      await assert.rejects(store.claim(['FICTIONAL_TEST'], 2147483648), /INVALID_OUTBOX_LEASE/)
      const dummy: ClaimedJob = {
        id: randomUUID(),
        organizationId: null,
        topic: 'FICTIONAL_TEST',
        aggregateType: 'TEST',
        aggregateId: 'TEST',
        eventType: 'TEST',
        payload: {},
        attemptCount: 1,
        maxAttempts: 3,
        lockedBy: 'TEST',
      }
      await assert.rejects(
        store.fail(dummy, 'TEST', false, 2147483648),
        /INVALID_OUTBOX_RETRY_DELAY/,
      )
      await assert.rejects(store.complete(dummy, effect, 2147483648), /INVALID_OUTBOX_TIMEOUT/)
    })
    await t.test('sixteen concurrent claims acquire one job exactly once', async () => {
      const topic = `results-test-${randomUUID()}`
      const id = await enqueue(topic)
      const claims = await Promise.all(
        Array.from({ length: 16 }, () => store.claim([topic], 30000)),
      )
      const acquired = claims.filter((job) => job !== null)
      assert.equal(acquired.length, 1)
      assert.equal(acquired[0]?.id, id)
      assert.equal((await state(id)).attemptCount, 1)
      await store.complete(acquired[0]!, effect, 10000)
      assert.equal((await state(id)).effects, 1)
    })

    await t.test(
      'real pg transaction timeout rolls back writes and leaves the pool usable',
      async () => {
        const topic = `results-test-${randomUUID()}`
        const id = await enqueue(topic)
        const job = (await store.claim([topic], 30000))!
        await assert.rejects(
          db.transaction(async (tx) => {
            await effect(tx, job)
            await tx.query('SELECT pg_sleep(0.2)', [])
          }, 50),
        )
        assert.equal((await state(id)).effects, 0)
        const rows = await db.query<{ ready: number }>('SELECT 1 AS ready', [])
        assert.equal(rows[0]?.ready, 1)
      },
    )

    await t.test(
      'actual process exit after claim, then two new processes produce one committed effect',
      async () => {
        const topic = `results-test-${randomUUID()}`
        const id = await enqueue(topic)
        assert.deepEqual(await runChild(topic, 'CLAIM_AND_EXIT'), { acquired: true })
        assert.equal((await state(id)).status, 'PROCESSING')
        await prisma.$executeRawUnsafe(
          "UPDATE outbox_jobs SET locked_until = now() - interval '1 second' WHERE id = $1::uuid",
          id,
        )
        assert.deepEqual(await runChild(topic, 'COMPLETE'), { acquired: true })
        assert.deepEqual(await runChild(topic, 'COMPLETE'), { acquired: false })
        const row = await state(id)
        assert.equal(row.status, 'SUCCEEDED')
        assert.equal(row.attemptCount, 2)
        assert.equal(row.effects, 1)
      },
    )

    await t.test(
      'restart reclaims expired lease, old execution and old failure cannot write',
      async () => {
        const topic = `results-test-${randomUUID()}`
        const id = await enqueue(topic)
        const old = (await store.claim([topic], 30000))!
        await prisma.$executeRawUnsafe(
          "UPDATE outbox_jobs SET locked_until = now() - interval '1 second' WHERE id = $1::uuid",
          id,
        )
        const restarted = new PostgresOutboxStore(db)
        const current = (await restarted.claim([topic], 30000))!
        assert.equal(current.attemptCount, 2)
        assert.notEqual(current.lockedBy, old.lockedBy)
        let called = false
        await assert.rejects(
          store.complete(
            old,
            async () => {
              called = true
            },
            10000,
          ),
          LostLeaseError,
        )
        assert.equal(called, false)
        assert.equal(await store.fail(old, 'STALE_TEST_FAILURE', false, 100), false)
        await restarted.complete(current, effect, 10000)
        await assert.rejects(restarted.complete(current, effect, 10000), LostLeaseError)
        assert.equal((await state(id)).effects, 1)
        assert.equal(await restarted.claim([topic], 30000), null)
      },
    )

    await t.test('handler effects roll back on error, retry commits once', async () => {
      const topic = `results-test-${randomUUID()}`
      const id = await enqueue(topic)
      const first = (await store.claim([topic], 30000))!
      await assert.rejects(
        store.complete(
          first,
          async (tx, job) => {
            await effect(tx, job)
            throw new Error('FICTIONAL_TEST_FAILURE')
          },
          10000,
        ),
        /FICTIONAL_TEST_FAILURE/,
      )
      assert.equal((await state(id)).effects, 0)
      assert.equal(await store.fail(first, 'TEST_TRANSIENT_FAILURE', false, 60000), true)
      assert.equal((await state(id)).status, 'FAILED_RETRYABLE')
      assert.equal(await store.claim([topic], 30000), null)
      await prisma.$executeRawUnsafe(
        'UPDATE outbox_jobs SET available_at = now() WHERE id = $1::uuid',
        id,
      )
      const retry = (await store.claim([topic], 30000))!
      assert.equal(retry.attemptCount, 2)
      await store.complete(retry, effect, 10000)
      assert.equal((await state(id)).effects, 1)
      assert.equal((await state(id)).status, 'SUCCEEDED')
    })

    await t.test('a lease expiring before commit rolls back all handler effects', async () => {
      const topic = `results-test-${randomUUID()}`
      const id = await enqueue(topic)
      const current = (await store.claim([topic], 30000))!
      await assert.rejects(
        store.complete(
          current,
          async (tx, job) => {
            await effect(tx, job)
            // Deterministic expiry injection in the disposable fixture database.
            await tx.query(
              "UPDATE outbox_jobs SET locked_until = now() - interval '1 second' WHERE id = $1::uuid RETURNING id",
              [id],
            )
          },
          10000,
        ),
        LostLeaseError,
      )
      assert.equal((await state(id)).effects, 0)
      assert.equal((await state(id)).status, 'PROCESSING')
    })

    await t.test('claim skips a row locked by the effect transaction', async () => {
      const topic = `results-test-${randomUUID()}`
      const id = await enqueue(topic)
      const current = (await store.claim([topic], 30000))!
      let entered!: () => void
      let release!: () => void
      const ready = new Promise<void>((resolve) => {
        entered = resolve
      })
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const completing = store.complete(
        current,
        async (tx, job) => {
          await effect(tx, job)
          await tx.query(
            "UPDATE outbox_jobs SET locked_until = now() - interval '1 second' WHERE id = $1::uuid RETURNING id",
            [id],
          )
          entered()
          await gate
          await tx.query(
            "UPDATE outbox_jobs SET locked_until = now() + interval '30 seconds' WHERE id = $1::uuid RETURNING id",
            [id],
          )
        },
        10000,
      )
      try {
        await ready
        assert.equal(await store.claim([topic], 30000), null)
      } finally {
        release()
        await completing
      }
      assert.equal((await state(id)).effects, 1)
    })

    await t.test(
      'final attempt crash becomes permanent without running another handler',
      async () => {
        const topic = `results-test-${randomUUID()}`
        const id = await enqueue(topic, 1)
        assert.ok(await store.claim([topic], 30000))
        await prisma.$executeRawUnsafe(
          "UPDATE outbox_jobs SET locked_until = now() - interval '1 second' WHERE id = $1::uuid",
          id,
        )
        assert.equal(await store.claim([topic], 30000), null)
        const row = await state(id)
        assert.equal(row.status, 'FAILED_PERMANENT')
        assert.equal(row.attemptCount, 1)
        assert.equal(row.code, 'OUTBOX_ATTEMPTS_EXHAUSTED')
      },
    )

    await t.test('permanent failures and retry exhaustion become terminal', async () => {
      for (const permanent of [false, true]) {
        const topic = `results-test-${randomUUID()}`
        const id = await enqueue(topic, permanent ? 3 : 1)
        const current = (await store.claim([topic], 30000))!
        assert.equal(await store.fail(current, 'TEST_FAILURE', permanent, 100), true)
        const row = await state(id)
        assert.equal(row.status, 'FAILED_PERMANENT')
        assert.equal(row.error, null)
        assert.equal(await store.claim([topic], 30000), null)
      }
    })

    await t.test('consumer refuses organization-less result events on real storage', async () => {
      const topic = `results-test-${randomUUID()}`
      const id = await enqueue(topic)
      const runner = new OutboxConsumer(store, new Map([[topic, effect]]), {
        concurrency: 2,
        leaseMs: 30000,
        transactionTimeoutMs: 10000,
        retryBaseMs: 100,
        retryMaxMs: 1000,
      })
      assert.equal(await runner.tick(), 0)
      const row = await state(id)
      assert.equal(row.status, 'FAILED_PERMANENT')
      assert.equal(row.code, 'OUTBOX_ORGANIZATION_REQUIRED')
      assert.equal(row.effects, 0)
      await runner.stop()
    })

    await t.test(
      'other topics, future work, cancellation and success are never claimed',
      async () => {
        const topic = `results-test-${randomUUID()}`
        const other = await enqueue(`other-${randomUUID()}`)
        const future = await enqueue(topic)
        const cancelled = await enqueue(topic)
        const success = await enqueue(topic)
        await prisma.$executeRawUnsafe(
          "UPDATE outbox_jobs SET available_at = now() + interval '1 day' WHERE id = $1::uuid",
          future,
        )
        await prisma.$executeRawUnsafe(
          "UPDATE outbox_jobs SET status = 'CANCELLED' WHERE id = $1::uuid",
          cancelled,
        )
        await prisma.$executeRawUnsafe(
          "UPDATE outbox_jobs SET status = 'SUCCEEDED' WHERE id = $1::uuid",
          success,
        )
        assert.equal(await store.claim([topic], 30000), null)
        assert.equal((await state(other)).status, 'PENDING')
        assert.equal((await state(future)).attemptCount, 0)
        assert.equal((await state(cancelled)).status, 'CANCELLED')
        assert.equal((await state(success)).status, 'SUCCEEDED')
      },
    )
  } finally {
    try {
      for (const id of ids) {
        await prisma.$executeRawUnsafe(
          'DELETE FROM results_worker_test_effects WHERE job_id = $1::uuid',
          id,
        )
        await prisma.$executeRawUnsafe('DELETE FROM outbox_jobs WHERE id = $1::uuid', id)
      }
    } finally {
      await closeTestDatabase()
    }
  }
})
