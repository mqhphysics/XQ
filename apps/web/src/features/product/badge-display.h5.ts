import { useSyncExternalStore } from 'react'
import { readSession } from './session'
const selections = new Map<string, string | null>()
const listeners = new Set<() => void>()
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function updateBadgeDisplay(userId: string, kind: string | null) {
  const session = readSession()
  if (!session) return
  selections.set(`${session.user.organizationId}:${userId}`, kind)
  for (const listener of listeners) listener()
}
export function useBadgeDisplay(userId?: string) {
  const org = readSession()?.user.organizationId ?? ''
  return useSyncExternalStore(
    subscribe,
    () => selections.get(`${org}:${userId ?? ''}`),
    () => undefined,
  )
}
