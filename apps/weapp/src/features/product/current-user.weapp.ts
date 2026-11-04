import { useEffect, useState } from 'react'
import { productRepository } from './product.repository'
import { readSession, saveSession, subscribeToSessionWrites } from './session'

let pending: { token: string; task: Promise<void> } | undefined
export function refreshNativeCurrentUser(): Promise<void> {
  const initial = readSession()
  if (!initial) return Promise.resolve()
  if (pending?.token === initial.accessToken) return pending.task
  const task = productRepository.getMe().then((fresh) => {
    const current = readSession()
    if (current?.accessToken === initial.accessToken && fresh.id === current.user.id)
      saveSession({ ...current, user: fresh })
  })
  pending = { token: initial.accessToken, task }
  void task
    .finally(() => {
      if (pending?.task === task) pending = undefined
    })
    .catch(() => {})
  return task
}

export function useStoredSessionUser() {
  const [user, setUser] = useState(() => readSession()?.user || null)
  useEffect(() => {
    const unsubscribe = subscribeToSessionWrites(() => setUser(readSession()?.user || null))
    return unsubscribe
  }, [])
  return user
}
export function useNativeCurrentUser() {
  const user = useStoredSessionUser()
  useEffect(() => {
    void refreshNativeCurrentUser().catch(() => {})
  }, [])
  return user
}
