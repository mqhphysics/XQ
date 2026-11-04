import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PgSqlClient,
  SqlTransactionTimeoutError,
  type PgConnection,
  type PgPool,
} from './pg-sql-client'

// Controlled lifecycle tests; real Pool/PostgreSQL tests follow integrator dependency installation.
class ControlledPool implements PgPool {
  commands: string[] = []
  released: Array<Error | undefined> = []
  rollbackFails = false
  async query(): Promise<{ rows: unknown[] }> {
    throw new Error('POOL_QUERY_INSIDE_TRANSACTION')
  }
  async connect(): Promise<PgConnection> {
    return {
      query: async (sql) => {
        this.commands.push(sql)
        if (sql === 'ROLLBACK' && this.rollbackFails) throw new Error('broken connection')
        return { rows: [] }
      },
      release: (error) => {
        this.released.push(error)
      },
    }
  }
  async end(): Promise<void> {}
}

test('transaction uses one dedicated connection and commits after the work', async () => {
  const pool = new ControlledPool()
  const sql = new PgSqlClient(pool)
  await sql.transaction(async (tx) => {
    await tx.query('TEST_WRITE', [])
  }, 1000)
  assert.equal(pool.commands[0], 'BEGIN')
  assert.equal(pool.commands.at(-2), 'TEST_WRITE')
  assert.equal(pool.commands.at(-1), 'COMMIT')
  assert.deepEqual(pool.released, [undefined])
})

test('handler failure rolls back and broken rollback destroys the connection', async () => {
  for (const rollbackFails of [false, true]) {
    const pool = new ControlledPool()
    pool.rollbackFails = rollbackFails
    const sql = new PgSqlClient(pool)
    await assert.rejects(
      sql.transaction(async () => {
        throw new Error('FICTIONAL_TEST_ERROR')
      }, 1000),
      /FICTIONAL_TEST_ERROR/,
    )
    assert.equal(pool.commands.at(-1), 'ROLLBACK')
    assert.equal(pool.commands.includes('COMMIT'), false)
    assert.equal(pool.released.length, 1)
    assert.equal(pool.released[0] instanceof Error, rollbackFails)
  }
})

test('timeout destroys the connection, and late handler work cannot use a released transaction', async () => {
  const pool = new ControlledPool()
  const sql = new PgSqlClient(pool)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let late!: Promise<void>
  await assert.rejects(
    sql.transaction(async (tx) => {
      late = gate.then(async () => {
        await assert.rejects(tx.query('LATE_WRITE', []), /TRANSACTION_CLOSED/)
      })
      await gate
    }, 10),
    SqlTransactionTimeoutError,
  )
  release()
  await late
  assert.equal(pool.commands.includes('COMMIT'), false)
  assert.equal(pool.commands.includes('LATE_WRITE'), false)
  assert.equal(pool.released.length, 1)
  assert.ok(pool.released[0] instanceof SqlTransactionTimeoutError)
})

test('timeout during a blocked rollback destroys the connection only once', async () => {
  const pool = new ControlledPool()
  let rejectRollback: ((error: Error) => void) | undefined
  pool.connect = async () => ({
    query: async (sql) => {
      pool.commands.push(sql)
      if (sql === 'ROLLBACK')
        await new Promise<never>((_resolve, reject) => {
          rejectRollback = reject
        })
      return { rows: [] }
    },
    release: (error) => {
      pool.released.push(error)
      if (error) rejectRollback?.(error)
    },
  })
  await assert.rejects(
    new PgSqlClient(pool).transaction(async () => {
      throw new Error('FICTIONAL_TEST_FAILURE')
    }, 10),
    /FICTIONAL_TEST_FAILURE/,
  )
  assert.equal(pool.released.length, 1)
  assert.ok(pool.released[0] instanceof SqlTransactionTimeoutError)
})
