import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { productRequest, ProductApiError } from '../product/product.repository'
import { readSession, subscribeToSessionChanges } from '../product/session.h5'
import type { PostSummary } from '../product/product.types'

export interface DesktopFeed {
  items: PostSummary[]
  batchId: string
  tournamentId: string
  nextCursor: number | null
  algorithm: string
  modelState: 'READY' | 'TRAINING' | 'COLD'
  modelVersion: string | null
}
const identity = () => {
  const session = readSession()
  return session ? `${session.user.organizationId}:${session.user.id}` : 'guest'
}
export function useDesktopFeed(tournamentId: string) {
  const [feed, setFeed] = useState<DesktopFeed | null>(null)
  const [viewer, setViewer] = useState(identity)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const pending = useRef(false)
  useEffect(() => subscribeToSessionChanges(() => setViewer(identity())), [])
  useEffect(() => {
    const published = (event: Event) => {
      const post = (event as CustomEvent<PostSummary>).detail
      if (post?.tournamentId !== tournamentId) return
      setFeed((current) =>
        current
          ? { ...current, items: [post, ...current.items.filter((item) => item.id !== post.id)] }
          : current,
      )
    }
    window.addEventListener('xiaoqiu:post-published', published)
    return () => window.removeEventListener('xiaoqiu:post-published', published)
  }, [tournamentId])
  const load = useCallback(
    async (append = false) => {
      if (pending.current) return
      pending.current = true
      setBusy(true)
      setError('')
      const current = ++generation.current
      const account = identity()
      const params = new URLSearchParams({ tournamentId })
      if (append && feed && feed.nextCursor !== null) {
        params.set('batchId', feed.batchId)
        params.set('cursor', String(feed.nextCursor))
      } else params.set('refresh', crypto.randomUUID())
      try {
        const next = await productRequest<DesktopFeed>('/public/feed?' + params, { refresh: true })
        if (generation.current !== current || identity() !== account) return
        setFeed((previous) => ({
          ...next,
          items:
            append && previous
              ? [
                  ...previous.items,
                  ...next.items.filter((item) => !previous.items.some((old) => old.id === item.id)),
                ]
              : next.items,
        }))
      } catch (issue) {
        if (generation.current === current && identity() === account) {
          setError(
            issue instanceof ProductApiError && issue.statusCode === 410
              ? '这批动态已过期，请换一批。'
              : '动态暂时未更新，可重试。',
          )
        }
      } finally {
        if (generation.current === current) {
          pending.current = false
          setBusy(false)
        }
      }
    },
    [tournamentId, feed],
  )
  const latest = useRef(load)
  latest.current = load
  useEffect(() => {
    generation.current++
    pending.current = false
    setFeed(null)
    void latest.current()
    return () => {
      generation.current++
      pending.current = false
    }
  }, [tournamentId, viewer])
  return { feed, busy, error, refresh: () => load(false), more: () => load(true) }
}

type FeedEvent = {
  eventId: string
  postId: string
  batchId?: string
  kind: 'READ' | 'IMPRESSION'
  durationMs: number
}
let queue: Array<{ account: string; event: FeedEvent }> = []
let timer: ReturnType<typeof setTimeout> | undefined
let pendingEvents = false
let failures = 0
let detailCount = 0
const CHANGE = 'xiaoqiu:feed-visibility'
function enqueue(event: FeedEvent) {
  if (!readSession()) return
  queue.push({ account: identity(), event })
  queue = queue.slice(-100)
  if (!timer)
    timer = setTimeout(() => {
      timer = undefined
      void flushDesktopFeedEvents()
    }, 1800)
}
export async function flushDesktopFeedEvents() {
  if (pendingEvents) return
  const account = identity()
  queue = queue.filter((item) => item.account === account)
  if (account === 'guest') {
    queue = []
    return
  }
  const items = queue.splice(0, 25)
  if (!items.length) return
  pendingEvents = true
  try {
    await productRequest('/me/feed-events', {
      method: 'POST',
      data: { events: items.map((item) => item.event) },
    })
    failures = 0
  } catch (issue) {
    if (
      identity() === account &&
      !(issue instanceof ProductApiError && [400, 401, 403].includes(issue.statusCode))
    ) {
      queue = [...items, ...queue].slice(0, 100)
      failures++
    }
  } finally {
    pendingEvents = false
    if (queue.length && failures < 3 && !timer)
      timer = setTimeout(
        () => {
          timer = undefined
          void flushDesktopFeedEvents()
        },
        1800 * (failures + 1),
      )
  }
}

export function DesktopFeedExposure({
  postId,
  batchId,
  children,
}: PropsWithChildren<{ postId: string; batchId?: string | undefined }>) {
  const ref = useRef<HTMLDivElement>(null)
  const sent = useRef('')
  useEffect(() => {
    const element = ref.current
    if (!element || !batchId) return
    let visible = false
    let qualify: ReturnType<typeof setTimeout> | undefined
    const stop = () => {
      if (qualify) clearTimeout(qualify)
      qualify = undefined
    }
    const check = () => {
      stop()
      if (
        !visible ||
        detailCount ||
        document.visibilityState !== 'visible' ||
        !document.hasFocus() ||
        sent.current === batchId
      )
        return
      qualify = setTimeout(() => {
        if (
          document.querySelector('[aria-modal="true"]') ||
          detailCount ||
          document.visibilityState !== 'visible' ||
          !document.hasFocus()
        )
          return
        sent.current = batchId
        enqueue({
          eventId: crypto.randomUUID(),
          postId,
          batchId,
          kind: 'IMPRESSION',
          durationMs: 900,
        })
      }, 900)
    }
    const observer = new IntersectionObserver(
      (entries) => {
        visible = (entries[0]?.intersectionRatio ?? 0) >= 0.5
        check()
      },
      { threshold: [0, 0.5, 1] },
    )
    observer.observe(element)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    window.addEventListener('blur', stop)
    window.addEventListener(CHANGE, check)
    return () => {
      observer.disconnect()
      stop()
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
      window.removeEventListener('blur', stop)
      window.removeEventListener(CHANGE, check)
    }
  }, [postId, batchId])
  return (
    <div ref={ref} data-feed-post-id={postId}>
      {children}
    </div>
  )
}

export function useDesktopPostRead(postId: string, loaded: boolean) {
  useEffect(() => {
    detailCount++
    window.dispatchEvent(new Event(CHANGE))
    return () => {
      detailCount--
      queueMicrotask(() => window.dispatchEvent(new Event(CHANGE)))
    }
  }, [postId])
  useEffect(() => {
    if (!loaded) return
    let started = 0
    const account = identity()
    const start = () => {
      if (
        document.visibilityState === 'visible' &&
        document.hasFocus() &&
        !started &&
        identity() === account
      )
        started = performance.now()
    }
    const stop = () => {
      if (started) {
        const durationMs = Math.min(120000, Math.floor(performance.now() - started))
        started = 0
        if (durationMs >= 800 && identity() === account)
          enqueue({ eventId: crypto.randomUUID(), postId, kind: 'READ', durationMs })
      }
      void flushDesktopFeedEvents()
    }
    const visibility = () => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }
    start()
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('focus', start)
    window.addEventListener('blur', stop)
    window.addEventListener('pagehide', stop)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('focus', start)
      window.removeEventListener('blur', stop)
      window.removeEventListener('pagehide', stop)
    }
  }, [postId, loaded])
}
