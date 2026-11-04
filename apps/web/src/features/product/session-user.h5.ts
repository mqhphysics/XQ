import { useEffect, useState } from 'react'
import { readSession, subscribeToSessionChanges } from './session.h5'
import type { AuthUser } from './product.types'

/**
 * Current account user, kept live: avatar or name changes saved anywhere in the app
 * (saveSession) re-render every consumer immediately.
 */
export function useSessionUser(): AuthUser | null {
  const [user, setUser] = useState<AuthUser | null>(() => readSession()?.user ?? null)
  useEffect(() => {
    const sync = () =>
      setUser((current) => {
        const next = readSession()?.user ?? null
        return current &&
          next &&
          current.id === next.id &&
          current.avatarUrl === next.avatarUrl &&
          current.displayName === next.displayName
          ? current
          : next
      })
    sync()
    return subscribeToSessionChanges(sync)
  }, [])
  return user
}
