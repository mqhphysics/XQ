import { createRequire } from 'node:module'

import { OutboxConsumer, type ConsumerOptions } from './outbox/outbox-consumer'
import { PostgresOutboxStore, validDuration } from './outbox/outbox-store'
import { PgSqlClient, type PgPool } from './outbox/pg-sql-client'
import { createMatchReportHandler } from './results/match-report-handler'
import { matchReportNotificationReceipt } from './results/notification-receipt-handler'
import { PostgresResultProjectionRepository } from './results/postgres-projection-repository'
import { buildResultProjectionPayload } from './results/projection-payload'

export interface WorkerOptions extends ConsumerOptions {
  pollMs: number
}
export function workerOptions(env: NodeJS.ProcessEnv): WorkerOptions {
  function integer(key: string, fallback: number): number {
    const raw = env[key]
    if (raw === undefined) return fallback
    if (!/^\d+$/.test(raw)) throw new Error('INVALID_WORKER_OPTIONS')
    return Number(raw)
  }
  const options = {
    concurrency: integer('WORKER_CONCURRENCY', 4),
    leaseMs: integer('WORKER_LEASE_MS', 30000),
    transactionTimeoutMs: integer('WORKER_TRANSACTION_TIMEOUT_MS', 10000),
    retryBaseMs: integer('WORKER_RETRY_BASE_MS', 250),
    retryMaxMs: integer('WORKER_RETRY_MAX_MS', 60000),
    pollMs: integer('WORKER_POLL_MS', 1000),
  }
  if (!validDuration(options.pollMs, 100)) throw new Error('INVALID_WORKER_POLL')
  return options
}

export class WorkerRuntime {
  readonly consumer: OutboxConsumer
  private timer: NodeJS.Timeout | undefined
  private polling: Promise<void> | undefined
  private running = false
  private stopping: Promise<void> | undefined
  constructor(
    private readonly sql: PgSqlClient,
    private readonly options: WorkerOptions,
    private readonly onError: (code: string) => void,
  ) {
    const repository = new PostgresResultProjectionRepository(buildResultProjectionPayload)
    this.consumer = new OutboxConsumer(
      new PostgresOutboxStore(sql),
      new Map([
        ['match.report', createMatchReportHandler(repository)],
        ['match.report.notification', matchReportNotificationReceipt],
      ]),
      options,
    )
  }

  async start(): Promise<void> {
    // Refuse a heartbeat-only apparent success when the required migration is absent.
    await this.sql.query('SELECT report_version, confirmed_report_version FROM matches LIMIT 0', [])
    await this.sql.query('SELECT source_report_version FROM match_result_projections LIMIT 0', [])
    this.running = true
    await this.poll()
  }

  private async poll(): Promise<void> {
    this.polling = (async () => {
      try {
        await this.consumer.tick()
      } catch {
        this.onError('OUTBOX_POLL_FAILED')
      }
      if (this.running)
        this.timer = setTimeout(() => {
          void this.poll()
        }, this.options.pollMs)
    })()
    await this.polling
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping
    this.stopping = this.drain()
    return this.stopping
  }

  private async drain(): Promise<void> {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    await this.consumer.stop()
    await this.polling
    await this.sql.close()
  }
}

export function createWorkerRuntime(
  env: NodeJS.ProcessEnv,
  onError: (code: string) => void,
): WorkerRuntime {
  if (!env.DATABASE_URL) throw new Error('WORKER_DATABASE_URL_REQUIRED')
  const options = workerOptions(env)
  type EventPool = PgPool & { on(event: 'error', handler: () => void): void }
  const { Pool } = createRequire(__filename)('pg') as { Pool: new (config: unknown) => EventPool }
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: options.concurrency + 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    statement_timeout: options.transactionTimeoutMs,
  })
  pool.on('error', () => onError('OUTBOX_POOL_ERROR'))
  try {
    return new WorkerRuntime(new PgSqlClient(pool), options, onError)
  } catch (error) {
    void pool.end()
    throw error
  }
}
