import type { CachedGet, GetCache } from './get-cache'
import { STALE_GET_MS } from './get-cache'

/**
 * Persists the H5 GET cache in localStorage so a reload or a revisit renders every tab from
 * the last copy at once and refreshes silently (stale-while-revalidate). Keys never contain
 * the bearer token (see cacheKey); entries older than a day and oversized bodies are skipped.
 */
const STORAGE_KEY = 'xiaoqiu.get-cache.v1'
const MAX_ENTRY_CHARS = 400_000
const MAX_TOTAL_CHARS = 2_400_000
const PERSISTED = [
  /^\* \/public\//,
  / \/public\/(?:home|tournaments|teams|matches|posts)/,
  / \/me\/team-preferences/,
  / \/auth\/me$/,
]

interface Stored {
  tournamentId?: string | undefined
  entries: Array<[string, CachedGet<unknown>]>
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function bindGetCacheStore(
  cache: GetCache,
  tournament: { remember: (id: string | undefined) => void; known: () => string },
): void {
  const store = storage()
  if (!store) return
  const now = Date.now()
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Stored
      tournament.remember(parsed.tournamentId)
      cache.restore(
        (parsed.entries ?? []).filter(
          ([, value]) => value && typeof value.at === 'number' && now - value.at <= STALE_GET_MS,
        ),
      )
    }
  } catch {
    store.removeItem(STORAGE_KEY)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const write = () => {
    timer = undefined
    const entries: Stored['entries'] = []
    let total = 0
    const sorted = cache
      .entries()
      .filter(([key]) => PERSISTED.some((pattern) => pattern.test(key)))
      .sort((a, b) => b[1].at - a[1].at)
    for (const [key, value] of sorted) {
      if (Date.now() - value.at > STALE_GET_MS) continue
      const size = JSON.stringify(value.data)?.length ?? 0
      if (size > MAX_ENTRY_CHARS || total + size > MAX_TOTAL_CHARS) continue
      total += size
      entries.push([
        key,
        { data: value.data, at: value.at, ...(value.etag ? { etag: value.etag } : {}) },
      ])
    }
    try {
      store.setItem(
        STORAGE_KEY,
        JSON.stringify({ tournamentId: tournament.known() || undefined, entries } satisfies Stored),
      )
    } catch {
      /* Quota: keep the in-memory cache only. */
    }
  }
  cache.subscribe(() => {
    if (timer === undefined) timer = setTimeout(write, 800)
  })
  window.addEventListener('pagehide', () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      write()
    }
  })
}

/** Called on logout so the next account never sees the previous account's copies. */
export function clearPersistedGetCache(): void {
  storage()?.removeItem(STORAGE_KEY)
}
