import { randomUUID } from 'node:crypto'

export interface SqlExecutor {
  query<T>(sql: string, parameters: unknown[]): Promise<T[]>
}

export interface TransactionalSqlClient extends SqlExecutor {
  // Must roll back on rejection; timeout must include lock waiting and handler execution.
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>, timeoutMs: number): Promise<T>
}

export interface ClaimedJob {
  id: string
  organizationId: string | null
  topic: string
  aggregateType: string
  aggregateId: string
  eventType: string
  payload: unknown
  attemptCount: number
  maxAttempts: number
  lockedBy: string
}

export class LostLeaseError extends Error {
  constructor() {
    super('OUTBOX_LEASE_LOST')
  }
}

export class PermanentJobError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

export interface OutboxStore {
  claim(topics: string[], leaseMs: number): Promise<ClaimedJob | null>
  complete(
    job: ClaimedJob,
    handler: (tx: SqlExecutor, job: ClaimedJob) => Promise<void>,
    timeoutMs: number,
  ): Promise<void>
  fail(job: ClaimedJob, code: string, permanent: boolean, delayMs: number): Promise<boolean>
}

// Durations are bound as PostgreSQL int4 and Node timers use the same upper bound.
export const MAX_OUTBOX_DURATION_MS = 2_147_483_647

export function validDuration(value: number, minimum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= MAX_OUTBOX_DURATION_MS
}

const columns = `id, organization_id AS "organizationId", topic,
  aggregate_type AS "aggregateType", aggregate_id AS "aggregateId",
  event_type AS "eventType", payload, attempt_count AS "attemptCount",
  max_attempts AS "maxAttempts", locked_by AS "lockedBy"`

// No generated API Client or schema changes. The integrator supplies the SQL adapter.
export class PostgresOutboxStore implements OutboxStore {
  constructor(private readonly db: TransactionalSqlClient) {}

  async claim(topics: string[], leaseMs: number): Promise<ClaimedJob | null> {
    if (topics.length === 0 || topics.some((topic) => topic.trim().length === 0))
      throw new Error('OUTBOX_TOPICS_REQUIRED')
    if (!validDuration(leaseMs, 1)) throw new Error('INVALID_OUTBOX_LEASE')
    // A fresh token for every claim fences earlier attempts, including process restarts.
    const token = randomUUID()
    const jobs = await this.db.query<ClaimedJob>(
      `
      WITH candidate AS (
        SELECT id FROM outbox_jobs
        WHERE topic = ANY($1::text[])
          AND (
            (status IN ('PENDING', 'FAILED_RETRYABLE') AND available_at <= clock_timestamp())
            OR (status = 'PROCESSING' AND locked_until <= clock_timestamp())
          )
        ORDER BY available_at, created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE outbox_jobs AS job SET
        status = CASE WHEN attempt_count >= max_attempts
          THEN 'FAILED_PERMANENT'::outbox_job_status ELSE 'PROCESSING'::outbox_job_status END,
        attempt_count = CASE WHEN attempt_count >= max_attempts THEN attempt_count ELSE attempt_count + 1 END,
        locked_by = CASE WHEN attempt_count >= max_attempts THEN NULL ELSE $2 END,
        locked_at = CASE WHEN attempt_count >= max_attempts THEN NULL ELSE clock_timestamp() END,
        locked_until = CASE WHEN attempt_count >= max_attempts THEN NULL
          ELSE clock_timestamp() + $3::integer * interval '1 millisecond' END,
        last_error_code = CASE WHEN attempt_count >= max_attempts THEN 'OUTBOX_ATTEMPTS_EXHAUSTED' ELSE NULL END,
        last_error = NULL,
        processed_at = NULL,
        updated_at = clock_timestamp()
      FROM candidate WHERE job.id = candidate.id
      RETURNING ${columns
        .split(',')
        .map((column) => `job.${column.trim()}`)
        .join(', ')}, job.status
    `,
      [topics, token, leaseMs],
    )
    const job = jobs[0]
    // Exhausted jobs were made terminal atomically; no handler may run for them.
    return job?.lockedBy === token ? job : null
  }

  async complete(
    job: ClaimedJob,
    handler: (tx: SqlExecutor, job: ClaimedJob) => Promise<void>,
    timeoutMs: number,
  ): Promise<void> {
    if (!validDuration(timeoutMs, 1)) throw new Error('INVALID_OUTBOX_TIMEOUT')
    await this.db.transaction(async (tx) => {
      const current = await tx.query<ClaimedJob>(
        `
        SELECT ${columns} FROM outbox_jobs
        WHERE id = $1::uuid AND status = 'PROCESSING'
          AND locked_by = $2 AND attempt_count = $3
          AND locked_until > clock_timestamp()
        FOR UPDATE
      `,
        [job.id, job.lockedBy, job.attemptCount],
      )
      if (!current[0]) throw new LostLeaseError()
      // Payload comes from the fenced, locked database row, not a caller-supplied copy.
      await handler(tx, current[0])
      const finished = await tx.query<{ id: string }>(
        `
        UPDATE outbox_jobs SET status = 'SUCCEEDED', processed_at = clock_timestamp(),
          locked_by = NULL, locked_at = NULL, locked_until = NULL,
          last_error_code = NULL, last_error = NULL, updated_at = clock_timestamp()
        WHERE id = $1::uuid AND status = 'PROCESSING'
          AND locked_by = $2 AND attempt_count = $3 AND locked_until > clock_timestamp()
        RETURNING id
      `,
        [job.id, job.lockedBy, job.attemptCount],
      )
      // Rolling back also rolls back the handler's database effects.
      if (!finished[0]) throw new LostLeaseError()
    }, timeoutMs)
  }

  async fail(job: ClaimedJob, code: string, permanent: boolean, delayMs: number): Promise<boolean> {
    if (!/^[A-Z][A-Z0-9_]{0,119}$/.test(code)) throw new Error('INVALID_OUTBOX_ERROR_CODE')
    if (!validDuration(delayMs, 0)) throw new Error('INVALID_OUTBOX_RETRY_DELAY')
    const changed = await this.db.query<{ id: string }>(
      `
      UPDATE outbox_jobs SET
        status = CASE WHEN $4::boolean OR attempt_count >= max_attempts
          THEN 'FAILED_PERMANENT'::outbox_job_status ELSE 'FAILED_RETRYABLE'::outbox_job_status END,
        available_at = clock_timestamp() + $5::integer * interval '1 millisecond',
        locked_by = NULL, locked_at = NULL, locked_until = NULL,
        last_error_code = $6, last_error = NULL, updated_at = clock_timestamp()
      WHERE id = $1::uuid AND status = 'PROCESSING'
        AND locked_by = $2 AND attempt_count = $3 AND locked_until > clock_timestamp()
      RETURNING id
    `,
      [job.id, job.lockedBy, job.attemptCount, permanent, delayMs, code],
    )
    return changed.length === 1
  }
}
