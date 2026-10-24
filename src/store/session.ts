import Taro from '@tarojs/taro'
import type { AuthSession, AuthUser } from '@/types'

const SESSION_KEY = 'xiaoqiu.session.v1'
const GUEST_KEY = 'xiaoqiu.guest.v1'
const sessionWriteListeners = new Set<() => void>()

export function subscribeToSessionWrites(listener: () => void): () => void {
  sessionWriteListeners.add(listener)
  return () => {
    sessionWriteListeners.delete(listener)
  }
}

export function readSession(): AuthSession | null {
  try {
    const value = Taro.getStorageSync<AuthSession | undefined>(SESSION_KEY)
    if (
      !value?.accessToken ||
      !value.user?.organizationId ||
      new Date(value.expiresAt).getTime() <= Date.now()
    ) {
      if (value) Taro.removeStorageSync(SESSION_KEY)
      return null
    }
    return value
  } catch {
    return null
  }
}

export function saveSession(session: AuthSession): void {
  Taro.removeStorageSync(GUEST_KEY)
  Taro.setStorageSync(SESSION_KEY, session)
  for (const listener of sessionWriteListeners) listener()
}

export function updateSessionUser(patch: Partial<AuthUser>): AuthSession | null {
  const current = readSession()
  if (!current) return null
  const next: AuthSession = {
    ...current,
    user: { ...current.user, ...patch },
  }
  saveSession(next)
  return next
}

export function clearSession(): void {
  Taro.removeStorageSync(SESSION_KEY)
  for (const listener of sessionWriteListeners) listener()
}

export function enterGuestMode(): void {
  clearSession()
  Taro.setStorageSync(GUEST_KEY, true)
}

export function leaveGuestMode(): void {
  Taro.removeStorageSync(GUEST_KEY)
}

export function isGuestMode(): boolean {
  try {
    return Taro.getStorageSync<boolean | undefined>(GUEST_KEY) === true
  } catch {
    return false
  }
}
