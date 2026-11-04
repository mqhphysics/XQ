export interface CachedGet<T> {
  data: T
  etag?: string
  at: number
  /** Set after a mutation: the data may still be shown, but an awaited read must refetch. */
  dirty?: boolean
}

export interface GetCache {
  peek<T>(key: string, maxAgeMs: number, now?: number): T | undefined
  read<T>(key: string): CachedGet<T> | undefined
  put<T>(key: string, data: T, etag: string | undefined, now?: number): void
  fresh(key: string, freshMs: number, now?: number): boolean
  /** Keep every entry for instant rendering but force the next awaited read to revalidate. */
  markStale(): void
  /** Called with the key whenever an entry is written. */
  subscribe(listener: (key: string) => void): () => void
  entries(): Array<[string, CachedGet<unknown>]>
  restore(entries: Array<[string, CachedGet<unknown>]>): void
  clear(): void
}

export function createGetCache(): GetCache {
  const entries = new Map<string, CachedGet<unknown>>()
  const listeners = new Set<(key: string) => void>()
  return {
    peek(key, maxAgeMs, now = Date.now()) {
      const hit = entries.get(key)
      if (!hit || now - hit.at > maxAgeMs) return undefined
      return hit.data as never
    },
    read(key) {
      return entries.get(key) as CachedGet<never> | undefined
    },
    put(key, data, etag, now = Date.now()) {
      entries.set(key, { data, ...(etag ? { etag } : {}), at: now })
      for (const listener of listeners) listener(key)
    },
    fresh(key, freshMs, now = Date.now()) {
      const hit = entries.get(key)
      return Boolean(hit && !hit.dirty && now - hit.at <= freshMs)
    },
    markStale() {
      for (const hit of entries.values()) hit.dirty = true
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    entries() {
      return [...entries.entries()]
    },
    restore(list) {
      for (const [key, value] of list) if (!entries.has(key)) entries.set(key, value)
    },
    clear() {
      entries.clear()
    },
  }
}

/** Reused without a request. */
export const FRESH_GET_MS = 60_000
/** Rendered instantly (and refreshed silently) up to this age, including after a reload. */
export const STALE_GET_MS = 24 * 60 * 60_000

export const productGetCache = createGetCache()

let featuredTournamentId = ''

export function rememberTournamentId(id: string | undefined): void {
  if (id) featuredTournamentId = id
}

export function knownTournamentId(): string {
  return featuredTournamentId
}

export function resetProductGetCache(): void {
  productGetCache.clear()
  featuredTournamentId = ''
}
