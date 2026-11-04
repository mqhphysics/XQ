import assert from 'node:assert/strict'

import { PostgresOutboxStore } from './outbox-store'
import { closeTestDatabase, db } from './postgres-test-client.test'

async function run(): Promise<void> {
  const topic = process.env.WORKER_TEST_TOPIC
  assert.ok(topic)
  assert.ok(topic.startsWith('results-test-'))
  const mode = process.env.WORKER_TEST_MODE
  assert.ok(mode === 'CLAIM_AND_EXIT' || mode === 'COMPLETE')
  const store = new PostgresOutboxStore(db)
  const job = await store.claim([topic], 30000)
  if (job && mode === 'COMPLETE') {
    await store.complete(
      job,
      async (tx, current) => {
        await tx.query(
          `INSERT INTO results_worker_test_effects (job_id, application_count) VALUES ($1::uuid, 1)
        ON CONFLICT (job_id) DO UPDATE SET application_count = results_worker_test_effects.application_count + 1 RETURNING job_id`,
          [current.id],
        )
      },
      10000,
    )
  }
  process.stdout.write(JSON.stringify({ acquired: job !== null }) + '\n')
  if (mode === 'CLAIM_AND_EXIT') process.exit(0) // Process dies with PROCESSING state, no graceful disconnect.
  await closeTestDatabase()
}

void run().catch(async () => {
  process.stderr.write('POSTGRES_TEST_CHILD_FAILED\n')
  await closeTestDatabase()
  process.exitCode = 1
})
