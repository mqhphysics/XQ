/** Share downloads, limit network contention, and discard failures so taps can retry. */
export function createMediaPreloader(
  download: (url: string) => Promise<string>,
  usable: (path: string) => boolean = () => true,
) {
  const cache = new Map<string, Promise<string>>()
  const queue: Array<() => void> = []
  let active = 0
  const drain = () => {
    while (active < 2 && queue.length) queue.shift()!()
  }
  const forget = (url: string) => cache.delete(url)
  const get = (url: string): Promise<string> => {
    const hit = cache.get(url)
    if (hit)
      return hit.then((path) => {
        if (usable(path)) return path
        if (cache.get(url) === hit) forget(url)
        return get(url)
      })
    const pending = new Promise<string>((resolve, reject) => {
      queue.push(() => {
        active++
        void Promise.resolve()
          .then(() => download(url))
          .then(resolve, reject)
          .finally(() => {
            active--
            drain()
          })
      })
    }).catch((issue: unknown) => {
      if (cache.get(url) === pending) forget(url)
      throw issue
    })
    cache.set(url, pending)
    while (cache.size > 12) cache.delete(cache.keys().next().value!)
    drain()
    return pending
  }
  return { get, forget }
}
