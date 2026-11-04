import Taro from '@tarojs/taro'

import { isUsableStoredSession } from './account-access'
import type { AuthSession } from './product.types'

const SESSION_KEY = 'xiaoqiu.session.v1'
const GUEST_KEY = 'xiaoqiu.guest.v1'
const LEGACY_SESSION_KEY = 'xiaoqiu.demo.session.v1'
const sessionWriteListeners = new Set<() => void>()

export function readSession(): AuthSession | null {
  try {
    Taro.removeStorageSync(LEGACY_SESSION_KEY)
    Taro.removeStorageSync(GUEST_KEY)
    const value: unknown = Taro.getStorageSync(SESSION_KEY)
    if (!isUsableStoredSession(value)) {
      if (value) Taro.removeStorageSync(SESSION_KEY)
      return null
    }
    return value
  } catch {
    return null
  }
}

export function saveSession(session: AuthSession): void {
  if (!isUsableStoredSession(session)) throw new Error('API 返回的登录会话无效，请重新登录')
  leaveGuestMode()
  Taro.setStorageSync(SESSION_KEY, session)
  for (const listener of sessionWriteListeners) listener()
}

export function clearSession(): void {
  Taro.removeStorageSync(SESSION_KEY)
  leaveGuestMode()
  for (const listener of sessionWriteListeners) listener()
}

// Keep the shared compact/WeChat page's exports, while H5 rejects old guest calls.
export function enterGuestMode(): never {
  throw new Error('当前仅向已登录账号开放，请登录后进入')
}

export function leaveGuestMode(): void {
  Taro.removeStorageSync(GUEST_KEY)
}

export function isGuestMode(): boolean {
  return false
}

export function subscribeToSessionChanges(onChange: () => void): () => void {
  sessionWriteListeners.add(onChange)
  const onStorage = (event: StorageEvent) => {
    if (
      event.storageArea === window.localStorage &&
      (event.key === SESSION_KEY || event.key === null)
    ) {
      onChange()
    }
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') onChange()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener('focus', onChange)
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    sessionWriteListeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('focus', onChange)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

export function subscribeToExternalSessionChanges(onChange: () => void): () => void {
  let token = readSession()?.accessToken ?? null
  return subscribeToSessionChanges(() => {
    const nextToken = readSession()?.accessToken ?? null
    if (nextToken === token) return
    token = nextToken
    onChange()
  })
}
