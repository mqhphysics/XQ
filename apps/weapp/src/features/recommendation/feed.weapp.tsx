import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { View } from '@tarojs/components'
import { useContext, useEffect, useId, useRef, type PropsWithChildren } from 'react'
import { productRequest } from '../product/product.repository'
import type { PostSummary } from '../product/product.types'
import { readSession } from '../product/session'
import { NativeDetailActiveContext } from '../native-navigation/detail-context.weapp'
import { nativeRecommendationConfig } from './config.weapp'

export interface NativeFeed {
  items: PostSummary[]
  batchId: string
  tournamentId: string
  nextCursor: number | null
  algorithm: string
  modelState: string
  modelVersion?: string | null
}
export const feedUuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16)
    return (c === 'x' ? n : (n & 3) | 8).toString(16)
  })
export function loadNativeFeed(tournamentId?: string, batchId?: string, cursor?: number) {
  const query = [
    ...(tournamentId ? ['tournamentId=' + encodeURIComponent(tournamentId)] : []),
    ...(batchId
      ? ['batchId=' + encodeURIComponent(batchId), 'cursor=' + (cursor ?? 0)]
      : ['refresh=' + feedUuid()]),
  ].join('&')
  return productRequest<NativeFeed>('/public/feed?' + query)
}
type Event = {
  eventId: string
  postId: string
  batchId?: string
  kind: 'IMPRESSION' | 'READ'
  durationMs: number
}
let queue: Array<{ token: string; event: Event }> = [],
  timer: ReturnType<typeof setTimeout> | undefined,
  pending = false
function enqueue(event: Event) {
  if (!nativeRecommendationConfig.enabled) return
  const session = readSession()
  if (!session) return
  queue.push({ token: session.accessToken, event })
  queue = queue.slice(-100)
  if (!timer)
    timer = setTimeout(() => {
      timer = undefined
      void flushFeedEvents()
    }, 1800)
}
export async function flushFeedEvents() {
  if (!nativeRecommendationConfig.enabled) {
    queue = []
    return
  }
  if (pending) return
  const token = readSession()?.accessToken
  queue = queue.filter((item) => item.token === token)
  const batch = queue.splice(0, 25)
  if (!batch.length) return
  pending = true
  let sent = false
  try {
    await productRequest('/me/feed-events', {
      method: 'POST',
      data: { events: batch.map((item) => item.event) },
    })
    sent = true
  } catch {
    if (token === readSession()?.accessToken) queue = [...batch, ...queue].slice(0, 100)
  } finally {
    pending = false
    if (sent && queue.length && !timer)
      timer = setTimeout(() => {
        timer = undefined
        void flushFeedEvents()
      }, 1800)
  }
}
export function NativeFeedExposure({
  postId,
  batchId,
  active,
  children,
}: PropsWithChildren<{ postId: string; batchId: string; active: boolean }>) {
  const id = 'feed-exposure-' + useId().replace(/[^a-z0-9]/gi, ''),
    sent = useRef('')
  const page = useRef(Taro.getCurrentInstance().page)
  useEffect(() => {
    if (!nativeRecommendationConfig.enabled || !active) return
    let qualify: ReturnType<typeof setTimeout> | undefined
    if (!page.current) return
    const observer = Taro.createIntersectionObserver(page.current, { thresholds: [0.5] })
    observer.relativeToViewport().observe('#' + id, (value) => {
      if (qualify) {
        clearTimeout(qualify)
        qualify = undefined
      }
      if ((value.intersectionRatio ?? 0) >= 0.5 && sent.current !== batchId)
        qualify = setTimeout(() => {
          sent.current = batchId
          enqueue({ eventId: feedUuid(), postId, batchId, kind: 'IMPRESSION', durationMs: 900 })
        }, 900)
    })
    return () => {
      observer.disconnect()
      if (qualify) clearTimeout(qualify)
    }
  }, [active, postId, batchId, id])
  return (
    <View id={id} className="native-feed-exposure">
      {children}
    </View>
  )
}
export function useNativePostRead(postId: string, loaded: boolean) {
  const detailActive = useContext(NativeDetailActiveContext),
    start = useRef(0)
  const active = nativeRecommendationConfig.enabled && detailActive
  const stop = () => {
    if (start.current) {
      const durationMs = Math.min(120000, Date.now() - start.current)
      start.current = 0
      if (durationMs >= 800) enqueue({ eventId: feedUuid(), postId, kind: 'READ', durationMs })
    }
    void flushFeedEvents()
  }
  useEffect(() => {
    if (active && loaded) start.current = Date.now()
    return stop
  }, [active, loaded, postId])
  useDidHide(stop)
  useDidShow(() => {
    if (active && loaded && !start.current) start.current = Date.now()
  })
}
