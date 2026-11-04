import { validDuration, type SqlExecutor, type TransactionalSqlClient } from './outbox-store'

// Structural pg interfaces let the integrator install/wire Pool without coupling to API Prisma.
export interface PgQueryable {
  query(sql: string, parameters?: unknown[]): Promise<{ rows: unknown[] }>
}
export interface PgConnection extends PgQueryable {
  release(error?: Error): void
  on?(event: 'error', handler: (error: Error) => void): unknown
  removeListener?(event: 'error', handler: (error: Error) => void): unknown
}
export interface PgPool extends PgQueryable {
  connect(): Promise<PgConnection>
  end(): Promise<void>
}

export class SqlTransactionTimeoutError extends Error {
  constructor() {
    super('OUTBOX_TRANSACTION_TIMEOUT')
  }
}

export class PgSqlClient implements TransactionalSqlClient {
  constructor(private readonly pool: PgPool) {}

  async query<T>(sql: string, parameters: unknown[]): Promise<T[]> {
    return (await this.pool.query(sql, parameters)).rows as T[]
  }

  async transaction<T>(work: (tx: SqlExecutor) => Promise<T>, timeoutMs: number): Promise<T> {
    if (!validDuration(timeoutMs, 1)) throw new Error('INVALID_OUTBOX_TIMEOUT')
    // Pool.connectionTimeoutMillis must bound waiting for an available connection.
    const client = await this.pool.connect()
    let acceptingQueries = true
    let destroyed = false
    let timer: NodeJS.Timeout | undefined
    let rejectConnection!: (error: Error) => void
    const connectionFailure = new Promise<never>((_resolve, reject) => {
      rejectConnection = reject
    })
    const onConnectionError = (error: Error): void => {
      acceptingQueries = false
      if (!destroyed) {
        destroyed = true
        client.release(error)
      }
      rejectConnection(error)
    }
    client.on?.('error', onConnectionError)
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        if (destroyed) return
        acceptingQueries = false
        destroyed = true
        // Destroy the dedicated connection: PostgreSQL rolls back its transaction.
        // Never return a live timed-out transaction to the pool.
        client.release(new SqlTransactionTimeoutError())
        reject(new SqlTransactionTimeoutError())
      }, timeoutMs)
    })
    const tx: SqlExecutor = {
      query: async <R>(sql: string, parameters: unknown[]): Promise<R[]> => {
        if (!acceptingQueries) throw new Error('OUTBOX_TRANSACTION_CLOSED')
        return (await client.query(sql, parameters)).rows as R[]
      },
    }
    const transaction = async (): Promise<T> => {
      await client.query('BEGIN')
      await client.query(
        `SELECT
        set_config('statement_timeout', $1, true),
        set_config('lock_timeout', $1, true),
        set_config('idle_in_transaction_session_timeout', $1, true)`,
        [String(timeoutMs)],
      )
      const result = await work(tx)
      acceptingQueries = false
      if (destroyed) throw new SqlTransactionTimeoutError()
      await client.query('COMMIT')
      return result
    }
    try {
      return await Promise.race([transaction(), timeout, connectionFailure])
    } catch (error) {
      acceptingQueries = false
      if (!destroyed) {
        try {
          await client.query('ROLLBACK')
        } catch {
          if (!destroyed) {
            destroyed = true
            client.release(new Error('OUTBOX_ROLLBACK_FAILED'))
          }
        }
      }
      throw error
    } finally {
      if (timer) clearTimeout(timer)
      acceptingQueries = false
      client.removeListener?.('error', onConnectionError)
      if (!destroyed) client.release()
    }
  }

  close(): Promise<void> {
    return this.pool.end()
  }
}
