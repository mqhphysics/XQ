import Taro from '@tarojs/taro'

import type { AuthSession } from './product.types'

const SESSION_KEY = 'xiaoqiu.session.v1'
const GUEST_KEY = 'xiaoqiu.guest.v1'
const LEGACY_SESSION_KEY = 'xiaoqiu.demo.session.v1'
const sessionWriteListeners = new Set<() => void>()

export function subscribeToSessionWrites(listener: () => void): () => void {
  sessionWriteListeners.add(listener)
  return () => {
    sessionWriteListeners.delete(listener)
  }
}

export function readSession(): AuthSession | null {
  try {
    Taro.removeStorageSync(LEGACY_SESSION_KEY)
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

// H5 tabs share storage, but their rendered account state is independent.
export function subscribeToExternalSessionChanges(onChange: () => void): () => void {
  if (Taro.getEnv() !== Taro.ENV_TYPE.WEB || typeof window === 'undefined') return () => {}

  let accessToken = readSession()?.accessToken ?? null
  const rememberLocalSession = () => {
    accessToken = readSession()?.accessToken ?? null
  }
  const synchronize = () => {
    const nextAccessToken = readSession()?.accessToken ?? null
    if (nextAccessToken === accessToken) return
    accessToken = nextAccessToken
    onChange()
  }
  const onStorage = (event: StorageEvent) => {
    if (
      event.storageArea === window.localStorage &&
      (event.key === SESSION_KEY || event.key === null)
    ) {
      synchronize()
    }
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') synchronize()
  }

  // Writes in this tab already have their own navigation/update flow.
  sessionWriteListeners.add(rememberLocalSession)
  window.addEventListener('storage', onStorage)
  window.addEventListener('focus', synchronize)
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    sessionWriteListeners.delete(rememberLocalSession)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('focus', synchronize)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
