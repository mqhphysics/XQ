import type { ProductConfiguration } from '../../../../../packages/contracts/src/product-config'

export interface ConfigurationSnapshot {
  phase: 'unknown' | 'loading' | 'ready' | 'error'
  configuration: ProductConfiguration | null
  error: string | null
}

/** Memory only. Invalidating a refresh immediately removes previous permissions. */
export class ConfigurationCache {
  private value: ConfigurationSnapshot = { phase: 'unknown', configuration: null, error: null }
  private readonly listeners = new Set<() => void>()
  private generation = 0
  private loadedAt = 0
  private pending: Promise<ProductConfiguration> | null = null
  private readonly load: () => Promise<ProductConfiguration>
  private readonly now: () => number
  private readonly ttl: number

  constructor(load: () => Promise<ProductConfiguration>, now = Date.now, ttl = 30_000) {
    this.load = load
    this.now = now
    this.ttl = ttl
  }

  getSnapshot(): ConfigurationSnapshot {
    if (this.value.phase === 'ready' && this.now() - this.loadedAt >= this.ttl)
      return { phase: 'unknown', configuration: null, error: null }
    return this.value
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  invalidate(): void {
    this.generation++
    this.pending = null
    this.value = { phase: 'unknown', configuration: null, error: null }
    this.emit()
  }

  refresh(): Promise<ProductConfiguration> {
    const current = this.getSnapshot()
    if (current.phase === 'ready' && current.configuration)
      return Promise.resolve(current.configuration)
    if (this.pending) return this.pending
    const generation = this.generation
    this.value = { phase: 'loading', configuration: null, error: null }
    this.emit()
    const pending = Promise.resolve()
      .then(this.load)
      .then((configuration) => {
        if (generation !== this.generation) throw new Error('产品配置已刷新，请重试')
        this.loadedAt = this.now()
        this.value = { phase: 'ready', configuration, error: null }
        this.emit()
        return configuration
      })
      .catch((error: unknown) => {
        if (generation === this.generation) {
          this.value = {
            phase: 'error',
            configuration: null,
            error: '暂时无法读取功能配置，请检查连接后重试',
          }
          this.emit()
        }
        throw error
      })
      .finally(() => {
        if (this.pending === pending) this.pending = null
      })
    this.pending = pending
    return pending
  }

  /**
   * Background refresh for focus/visibility/keep-alive: the current permissions stay visible
   * until the new answer lands (no blank frame), and a failed answer still closes them.
   */
  revalidate(): Promise<ProductConfiguration> {
    const current = this.getSnapshot()
    if (current.phase !== 'ready' || !current.configuration) return this.refresh()
    if (this.pending) return this.pending
    const generation = this.generation
    const pending = Promise.resolve()
      .then(this.load)
      .then((configuration) => {
        if (generation !== this.generation) throw new Error('产品配置已刷新，请重试')
        this.loadedAt = this.now()
        this.value = { phase: 'ready', configuration, error: null }
        this.emit()
        return configuration
      })
      .catch((error: unknown) => {
        if (generation === this.generation) {
          this.value = {
            phase: 'error',
            configuration: null,
            error: '暂时无法读取功能配置，请检查连接后重试',
          }
          this.emit()
        }
        throw error
      })
      .finally(() => {
        if (this.pending === pending) this.pending = null
      })
    this.pending = pending
    return pending
  }

  /**
   * The last ready configuration even past its TTL (null after invalidate or a failed answer).
   * Navigation decides from it at once and revalidates in the background.
   */
  lastKnown(): ProductConfiguration | null {
    return this.value.phase === 'ready' ? this.value.configuration : null
  }

  /** Milliseconds since the current ready configuration was loaded (Infinity when none). */
  age(): number {
    return this.value.phase === 'ready' ? this.now() - this.loadedAt : Number.POSITIVE_INFINITY
  }

  get lifetime(): number {
    return this.ttl
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

/** A failed/expired account must never silently become an anonymous visitor. */
export class AccountRequirement {
  private required = false
  observe(hasAccountHint: boolean): void {
    if (hasAccountHint) this.required = true
  }
  needsAccount(): boolean {
    return this.required
  }
  clearByUser(): void {
    this.required = false
  }
}
