import { gifInfo } from './gif-info.logic.ts'
import { loopGifForever } from './gif-loop.ts'

export const GIF_CACHE_TTL = 3 * 24 * 60 * 60 * 1000
type Asset = {
  id: string
  contentUrl: string
  version?: number
  bytes: number
  frames?: number
  durationMs: number
}
interface Entry {
  sourceBytes: number
  storedBytes: number
  expiresAt: number
  usedAt: number
}
export type GifCacheIndex = Record<string, Entry>
export interface GifCacheIO {
  index: () => Promise<GifCacheIndex>
  persist: (index: GifCacheIndex) => Promise<void>
  read: (key: string) => Promise<ArrayBuffer>
  write: (key: string, bytes: ArrayBuffer) => Promise<void>
  remove: (key: string) => Promise<void>
  path: (key: string) => string
  fetch: (asset: Asset) => Promise<ArrayBuffer>
  now: () => number
}
export function createGifCache(io: GifCacheIO) {
  let index: GifCacheIndex = {},
    ready: Promise<void> | undefined,
    saves = Promise.resolve()
  const pending = new Map<string, Promise<string>>()
  const persist = () => {
    const snapshot = JSON.parse(JSON.stringify(index)) as GifCacheIndex
    saves = saves.catch(() => {}).then(() => io.persist(snapshot))
    return saves
  }
  const remove = async (key: string) => {
    delete index[key]
    if (/^[\w-]+$/.test(key)) await io.remove(key).catch(() => {})
  }
  const initialize = () =>
    (ready ||= (async () => {
      index = await io.index().catch(() => ({}))
      for (const [key, e] of Object.entries(index))
        if (
          !/^[\w-]+$/.test(key) ||
          !e ||
          !Number.isFinite(e.expiresAt) ||
          e.expiresAt <= io.now() ||
          !Number.isFinite(e.storedBytes) ||
          e.storedBytes < 14 ||
          !Number.isFinite(e.usedAt)
        )
          await remove(key)
    })())
  const check = (asset: Asset, bytes: ArrayBuffer) => {
    const info = gifInfo(bytes)
    if ((asset.frames && info.frames !== asset.frames) || info.durationMs !== asset.durationMs)
      throw Error('GIF 帧数或时长不完整，请重试')
    return info
  }
  return {
    load(asset: Asset): Promise<string> {
      const key = `${asset.id}-${asset.version || 1}`
      if (!/^[\w-]+$/.test(key)) return Promise.reject(Error('GIF 标识无效'))
      if (pending.has(key)) return pending.get(key)!
      const task = (async () => {
        await initialize()
        const existing = index[key]
        if (existing && existing.expiresAt > io.now() && existing.sourceBytes === asset.bytes) {
          try {
            const bytes = await io.read(key)
            if (bytes.byteLength !== existing.storedBytes || check(asset, bytes).loop !== 0)
              throw Error('Invalid cached GIF')
            existing.usedAt = io.now()
            await persist()
            return io.path(key)
          } catch {
            await remove(key)
          }
        } else if (existing) await remove(key)
        const original = await io.fetch(asset)
        if (original.byteLength !== asset.bytes) throw Error('GIF 文件尚未完整加载，请重试')
        check(asset, original)
        const bytes = loopGifForever(original)
        if (gifInfo(bytes).loop !== 0) throw Error('GIF 循环数据无效')
        await io.write(key, bytes)
        index[key] = {
          sourceBytes: asset.bytes,
          storedBytes: bytes.byteLength,
          expiresAt: io.now() + GIF_CACHE_TTL,
          usedAt: io.now(),
        }
        const oldest = Object.keys(index)
          .filter((k) => k !== key)
          .sort((a, b) => index[a]!.usedAt - index[b]!.usedAt)
        let total = Object.values(index).reduce((sum, e) => sum + e.storedBytes, 0)
        while (Object.keys(index).length > 16 || total > 64 * 1024 * 1024) {
          const victim = oldest.shift()
          if (!victim) break
          total -= index[victim]!.storedBytes
          await remove(victim)
        }
        await persist()
        return io.path(key)
      })()
      pending.set(key, task)
      void task.finally(() => pending.delete(key)).catch(() => {})
      return task
    },
  }
}
