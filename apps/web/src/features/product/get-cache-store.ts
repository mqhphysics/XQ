import type { GetCache } from './get-cache'

/** Mini-program: the GET cache stays in memory only. */
export function bindGetCacheStore(
  _cache: GetCache,
  _tournament: { remember: (id: string | undefined) => void; known: () => string },
): void {}
