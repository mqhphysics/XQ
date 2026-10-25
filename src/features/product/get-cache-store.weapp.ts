import Taro from '@tarojs/taro'
import type { CachedGet, GetCache } from './get-cache'
import { NATIVE_PREVIEW_GET_MS, nativePersistedPath } from './native-read-policy'
import { readSession } from './session'

const KEY = 'xiaoqiu.native-read-snapshot.v1'
const LIMIT = 750_000
export function bindGetCacheStore(
  cache: GetCache,
  _tournament: { remember: (id: string | undefined) => void; known: () => string },
) {
  try {
    const stored = Taro.getStorageSync<{
      version: number
      entries: Array<[string, CachedGet<unknown>]>
    }>(KEY)
    if (stored?.version === 1 && Array.isArray(stored.entries))
      cache.restore(
        stored.entries.filter(
          ([key, value]) =>
            key.startsWith('native:') &&
            value &&
            typeof value.at === 'number' &&
            Date.now() - value.at <= NATIVE_PREVIEW_GET_MS &&
            value.data &&
            typeof value.data === 'object',
        ),
      )
  } catch {
    /* Cached reads are optional; a miss uses the API. */
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
            Date.now() - value.at <= NATIVE_PREVIEW_GET_MS &&
            nativePersistedPath(key.slice(key.indexOf(' ') + 1)),
        )
        .sort((a, b) => b[1].at - a[1].at)
        .filter((item) => {
          const length = JSON.stringify(item).length
          if (length > 180_000 || total + length > LIMIT) return false
          total += length
          return true
        })
        .slice(0, 20)
      if (!entries.length) return
      try {
        Taro.setStorageSync(KEY, { version: 1, entries })
      } catch {
        /* Storage pressure must not block reading or publishing. */
      }
    }, 250)
  })
}
