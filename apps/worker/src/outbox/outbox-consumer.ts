import {
  LostLeaseError,
  PermanentJobError,
  validDuration,
  type ClaimedJob,
  type OutboxStore,
  type SqlExecutor,
} from './outbox-store'

export type OutboxHandler = (tx: SqlExecutor, job: ClaimedJob) => Promise<void>
export interface ConsumerOptions {
  concurrency: number
  leaseMs: number
  transactionTimeoutMs: number
  retryBaseMs: number
  retryMaxMs: number
}

export function retryDelay(
  attempt: number,
  baseMs: number,
  maxMs: number,
  random: () => number = Math.random,
): number {
  if (
    !Number.isSafeInteger(attempt) ||
    attempt < 1 ||
    !validDuration(baseMs, 1) ||
    !validDuration(maxMs, baseMs)
  )
    throw new Error('INVALID_OUTBOX_RETRY_OPTIONS')
  const sample = random()
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1)
    throw new Error('INVALID_OUTBOX_RANDOM')
  const capped = Math.min(maxMs, baseMs * 2 ** Math.min(attempt - 1, 30))
  // Equal jitter avoids synchronized retries while retaining a positive delay.
  return Math.max(1, Math.floor(capped / 2 + (sample * capped) / 2))
}

export class OutboxConsumer {
  private stopped = false
  private active: Promise<number> | undefined
  private readonly topics: string[]

  constructor(
    private readonly store: OutboxStore,
    private readonly handlers: ReadonlyMap<string, OutboxHandler>,
    private readonly options: ConsumerOptions,
  ) {
    if (
      !Number.isSafeInteger(options.concurrency) ||
      options.concurrency < 1 ||
      options.concurrency > 32
    )
      throw new Error('INVALID_OUTBOX_CONCURRENCY')
    if (
      !validDuration(options.transactionTimeoutMs, 1) ||
      !validDuration(options.leaseMs, options.transactionTimeoutMs + 1)
    )
      throw new Error('INVALID_OUTBOX_TIMEOUT')
    retryDelay(1, options.retryBaseMs, options.retryMaxMs, () => 0)
    this.topics = [...handlers.keys()]
    if (!this.topics.length || this.topics.some((topic) => !topic.trim()))
      throw new Error('OUTBOX_HANDLERS_REQUIRED')
  }

  // One bounded batch; the lifecycle adapter schedules the next tick after this settles.
  // Calling tick concurrently joins the existing batch instead of multiplying claims.
  tick(): Promise<number> {
    if (this.stopped) return Promise.resolve(0)
    if (this.active) return this.active
    this.active = this.runBatch().finally(() => {
      this.active = undefined
    })
    return this.active
  }

  async stop(): Promise<void> {
    this.stopped = true
    await this.active
  }

  private async runBatch(): Promise<number> {
    const completed = await Promise.allSettled(
      Array.from({ length: this.options.concurrency }, () => this.processOne()),
    )
    // Wait for every in-flight transaction before reporting infrastructure failure/shutdown.
    const failed = completed.find((result) => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
    return completed.reduce(
      (count, result) => count + (result.status === 'fulfilled' ? result.value : 0),
      0,
    )
  }

  private async processOne(): Promise<number> {
    const job = await this.store.claim(this.topics, this.options.leaseMs)
    if (!job) return 0
    try {
      await this.store.complete(
        job,
        async (tx, current) => {
          const handler = this.handlers.get(current.topic)
          if (!handler) throw new PermanentJobError('OUTBOX_HANDLER_MISSING')
          if (!current.organizationId) throw new PermanentJobError('OUTBOX_ORGANIZATION_REQUIRED')
          await handler(tx, current)
        },
        this.options.transactionTimeoutMs,
      )
    } catch (error) {
      if (error instanceof LostLeaseError) return 0
      const permanent = error instanceof PermanentJobError
      // Never persist exception messages: they can contain SQL, credentials or personal data.
      const code =
        permanent && /^[A-Z][A-Z0-9_]{0,119}$/.test(error.code)
          ? error.code
          : 'OUTBOX_HANDLER_FAILED'
      await this.store.fail(
        job,
        code,
        permanent,
        retryDelay(job.attemptCount, this.options.retryBaseMs, this.options.retryMaxMs),
      )
      return 0
    }
    return 1
  }
}
