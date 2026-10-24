import Taro from '@tarojs/taro'
import { readSession } from './session'

export interface CachedGet<T> {
  data: T
  etag?: string
  at: number
  dirty?: boolean
}

export interface GetCache {
  peek<T>(key: string, maxAgeMs: number, now?: number): T | undefined
  read<T>(key: string): CachedGet<T> | undefined
  put<T>(key: string, data: T, etag: string | undefined, now?: number): void
  fresh(key: string, freshMs: number, now?: number): boolean
  markStale(): void
  subscribe(listener: (key: string) => void): () => void
  entries(): Array<[string, CachedGet<unknown>]>
  restore(entries: Array<[string, CachedGet<unknown>]>): void
  clear(): void
}

export const FRESH_GET_MS = 8_000
export const PREVIEW_GET_MS = 2 * 60_000
export const STALE_GET_MS = 24 * 60 * 60_000

const SNAPSHOT_KEY = 'xiaoqiu.native-read-snapshot.v1'
const SNAPSHOT_LIMIT = 750_000

export function nativeReadKey(
  path: string,
  organization: string,
  user: string | undefined,
  tokenDigest: string,
) {
  return `native:${organization}:${user || 'guest'}:${tokenDigest} ${path}`
}

export function nativePersistedPath(path: string) {
  return /^\/public\/(?:home|posts|players|people|teams|matches|tournaments)(?:[/?]|$)/.test(path)
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
      for (const [key, value] of list) {
        if (!entries.has(key)) entries.set(key, value)
      }
    },
    clear() {
      entries.clear()
    },
  }
}

export const productGetCache = createGetCache()

export function bindGetCachePersistence(cache: GetCache = productGetCache) {
  try {
    const stored = Taro.getStorageSync<{
      version: number
      entries: Array<[string, CachedGet<unknown>]>
    }>(SNAPSHOT_KEY)
    if (stored?.version === 1 && Array.isArray(stored.entries)) {
      cache.restore(
        stored.entries.filter(
          ([key, value]) =>
            key.startsWith('native:') &&
            value &&
            typeof value.at === 'number' &&
            Date.now() - value.at <= PREVIEW_GET_MS &&
            value.data &&
            typeof value.data === 'object',
        ),
      )
    }
  } catch {
    /* Snapshot recovery is optional */
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  cache.subscribe(() => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const user = readSession()?.user
      const organization =
        user?.organizationId ||
        process.env.TARO_APP_ORGANIZATION_ID?.trim() ||
        '00000000-0000-4000-8000-000000000001'
      const prefix = `native:${organization}:${user?.id || 'guest'}:`
      let total = 0
      const entries = cache
        .entries()
        .filter(
          ([key, value]) =>
            key.startsWith(prefix) &&
            Date.now() - value.at <= PREVIEW_GET_MS &&
            nativePersistedPath(key.slice(key.indexOf(' ') + 1)),
        )
        .sort((a, b) => b[1].at - a[1].at)
        .filter((item) => {
          const length = JSON.stringify(item).length
          if (length > 180_000 || total + length > SNAPSHOT_LIMIT) return false
          total += length
          return true
        })
        .slice(0, 20)
      if (!entries.length) return
      try {
        Taro.setStorageSync(SNAPSHOT_KEY, { version: 1, entries })
      } catch {
        /* Ignore storage quota errors */
      }
    }, 250)
  })
}
