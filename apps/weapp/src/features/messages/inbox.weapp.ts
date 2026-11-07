import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { readSession, subscribeToSessionWrites } from '../product/session'
import { messageRepository } from './repository.weapp'
import type { MessageSummary } from './types'

type Snapshot = { summary: MessageSummary | null; error: string; loading: boolean }
let state: Snapshot = { summary: null, error: '', loading: false }
let owner = '',
  sequence = 0,
  foreground = true
let pending: Promise<void> | undefined
let timer: ReturnType<typeof setInterval> | undefined
let unsubscribeSession: (() => void) | undefined
const listeners = new Set<(snapshot: Snapshot) => void>()
const sessionKey = () => {
  const session = readSession()
  return session ? `${session.user.organizationId}:${session.user.id}:${session.accessToken}` : ''
}
const publish = (next: Snapshot) => {
  state = next
  for (const listener of listeners) listener(state)
}
function syncOwner() {
  const next = sessionKey()
  if (owner === next) return
  owner = next
  sequence++
  pending = undefined
  publish({ summary: null, error: '', loading: false })
}
export function acceptInboxSummary(summary: MessageSummary, token: string | undefined) {
  syncOwner()
  if (!token || readSession()?.accessToken !== token) return
  sequence++
  pending = undefined
  publish({ summary, error: '', loading: false })
}
export function refreshInbox(force = false): Promise<void> {
  syncOwner()
  if (!owner || !foreground) return Promise.resolve()
  if (pending && !force) return pending
  const ticket = ++sequence,
    before = owner
  if (!state.summary) publish({ ...state, loading: true })
  const task = messageRepository
    .summary()
    .then((summary) => {
      if (ticket === sequence && before === sessionKey())
        publish({ summary, error: '', loading: false })
    })
    .catch((reason) => {
      if (ticket === sequence && before === sessionKey())
        publish({
          ...state,
          error: reason instanceof Error ? reason.message : '消息暂未刷新',
          loading: false,
        })
    })
    .finally(() => {
      if (pending === task) pending = undefined
    })
  pending = task
  return task
}
const shown = () => {
  foreground = true
  void refreshInbox(true)
}
const hidden = () => {
  foreground = false
  sequence++
  pending = undefined
}
const blocksChanged = (event: { owner: string }) => {
  if (event.owner === readSession()?.user.id) void refreshInbox(true)
}
export function useInbox() {
  const [snapshot, setSnapshot] = useState<Snapshot>(() =>
    owner === sessionKey() ? state : { summary: null, error: '', loading: false },
  )
  useEffect(() => {
    listeners.add(setSnapshot)
    syncOwner()
    setSnapshot(state)
    if (listeners.size === 1) {
      foreground = true
      Taro.onAppShow(shown)
      Taro.onAppHide(hidden)
      Taro.eventCenter.on('xiaoqiu:native-blocks-changed', blocksChanged)
      unsubscribeSession = subscribeToSessionWrites(() => {
        const before = owner
        syncOwner()
        if (owner !== before) void refreshInbox(true)
      })
      timer = setInterval(() => {
        if (foreground) void refreshInbox()
      }, 15000)
      void refreshInbox()
    }
    return () => {
      listeners.delete(setSnapshot)
      if (!listeners.size) {
        clearInterval(timer)
        Taro.offAppShow(shown)
        Taro.offAppHide(hidden)
        Taro.eventCenter.off('xiaoqiu:native-blocks-changed', blocksChanged)
        unsubscribeSession?.()
      }
    }
  }, [])
  return snapshot
}
