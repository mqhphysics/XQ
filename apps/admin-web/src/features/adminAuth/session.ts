import type { AdminCredential, AdminSessionState, AdminUser } from './types'
import { adminKind, isUuid } from './types.ts'
import { configuredAdminOrganizationId, h5SessionBridgeEnabled } from './config.ts'

export const ADMIN_SESSION_KEY = 'xiaoqiu:admin-session:v1'
export const H5_SESSION_KEY = 'xiaoqiu.session.v1'
type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function createH5SessionBridge(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  context: { organizationId: string; currentOrigin: string; h5Origin: string },
) {
  const organizationId = context.organizationId.toLowerCase()
  const sameOrigin = Boolean(
    isUuid(organizationId) &&
    /^https?:\/\//.test(context.currentOrigin) &&
    context.currentOrigin === context.h5Origin,
  )
  const storedSession = (): Record<string, unknown> | null => {
    if (!sameOrigin) return null
    try {
      // Taro H5 stores JSON {data: AuthSession} in this window's localStorage.
      const raw = storage.getItem(H5_SESSION_KEY)
      const wrapper: unknown = raw ? JSON.parse(raw) : null
      if (!wrapper || typeof wrapper !== 'object') return null
      const data: unknown = (wrapper as { data?: unknown }).data
      return data && typeof data === 'object' ? (data as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  return {
    organizationId,
    read(): AdminCredential | null {
      const session = storedSession()
      if (!session || !validCredential(session)) return null
      const user = session.user as Record<string, unknown> | undefined
      if (
        !user ||
        typeof user.id !== 'string' ||
        !isUuid(user.id) ||
        typeof user.organizationId !== 'string' ||
        user.organizationId.toLowerCase() !== organizationId
      )
        return null
      // No cached identity or role is copied into the management session.
      return { accessToken: session.accessToken, expiresAt: session.expiresAt }
    },
    clear(accessToken: string): void {
      if (storedSession()?.accessToken !== accessToken) return
      try {
        storage.removeItem(H5_SESSION_KEY)
      } catch {
        /* Server revocation is still attempted by the logout flow. */
      }
    },
  }
}

type H5SessionBridge = ReturnType<typeof createH5SessionBridge>

export function validCredential(value: unknown): value is AdminCredential {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AdminCredential>
  return (
    typeof candidate.accessToken === 'string' &&
    /^[A-Za-z0-9_-]{32,256}$/.test(candidate.accessToken) &&
    typeof candidate.expiresAt === 'string' &&
    Number.isFinite(Date.parse(candidate.expiresAt)) &&
    Date.parse(candidate.expiresAt) > Date.now()
  )
}

export function createAdminSessionStore(storage?: SessionStorage, bridge?: H5SessionBridge) {
  let state: AdminSessionState = { credential: null, user: null, message: '' }
  let revision = 0
  const listeners = new Set<() => void>()
  try {
    const raw = storage?.getItem(ADMIN_SESSION_KEY)
    const stored: unknown = raw ? JSON.parse(raw) : null
    if (validCredential(stored))
      state = {
        ...state,
        credential: { accessToken: stored.accessToken, expiresAt: stored.expiresAt },
      }
    else storage?.removeItem(ADMIN_SESSION_KEY)
  } catch {
    /* A blocked/corrupt storage never authorizes a user. */
  }
  const h5Credential = bridge?.read()
  let lastH5Token = h5Credential?.accessToken ?? null
  if (h5Credential) state = { credential: h5Credential, user: null, message: '' }
  const emit = () => {
    revision += 1
    listeners.forEach((listener) => listener())
  }
  return {
    getSnapshot: () => state,
    getRevision: () => revision,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    start(credential: AdminCredential) {
      if (!validCredential(credential)) throw new Error('登录有效期无效，请重新登录。')
      const minimal = { accessToken: credential.accessToken, expiresAt: credential.expiresAt }
      state = { credential: minimal, user: null, message: '' }
      try {
        storage?.setItem(ADMIN_SESSION_KEY, JSON.stringify(minimal))
      } catch {
        /* In-memory session still works. */
      }
      emit()
    },
    verify(accessToken: string, user: AdminUser): boolean {
      if (state.credential?.accessToken !== accessToken || !validCredential(state.credential))
        return false
      if (!adminKind(user) || (bridge && user.organizationId !== bridge.organizationId))
        return false
      if (JSON.stringify(state.user) === JSON.stringify(user)) return true
      state = { ...state, user, message: '' }
      emit()
      return true
    },
    beginVerification(accessToken: string): boolean {
      if (state.credential?.accessToken !== accessToken) return false
      if (!state.user) return true
      state = { ...state, user: null }
      emit()
      return true
    },
    syncH5Session(): void {
      if (!bridge) return
      const next = bridge.read()
      const nextToken = next?.accessToken ?? null
      if (nextToken === lastH5Token) return
      const previousToken = lastH5Token
      lastH5Token = nextToken
      if (next) {
        state = { credential: next, user: null, message: '' }
      } else if (state.credential?.accessToken === previousToken) {
        state = { credential: null, user: null, message: '网站账号已退出，请重新登录。' }
      } else return
      try {
        if (next) storage?.setItem(ADMIN_SESSION_KEY, JSON.stringify(next))
        else storage?.removeItem(ADMIN_SESSION_KEY)
      } catch {
        /* Storage cannot confer authority; every adopted token is revalidated. */
      }
      emit()
    },
    clear(accessToken: string, message = '登录状态已失效，请重新登录。', clearH5 = true): boolean {
      if (state.credential?.accessToken !== accessToken) return false
      state = { credential: null, user: null, message }
      try {
        storage?.removeItem(ADMIN_SESSION_KEY)
      } catch {
        /* The next boot revalidates any residual credential. */
      }
      if (clearH5) bridge?.clear(accessToken)
      emit()
      return true
    },
    notifySignedOut(message: string) {
      if (state.credential) return
      state = { ...state, message }
      emit()
    },
  }
}

function browserH5Bridge(): H5SessionBridge | undefined {
  try {
    if (
      typeof window === 'undefined' ||
      !h5SessionBridgeEnabled() ||
      !/^\/admin(?:\/|$)/.test(window.location.pathname)
    )
      return undefined
    const organizationId = configuredAdminOrganizationId()
    if (!organizationId) return undefined
    return createH5SessionBridge(window.localStorage, {
      organizationId,
      currentOrigin: window.location.origin,
      h5Origin: window.location.origin,
    })
  } catch {
    return undefined
  }
}

function browserStorage(): SessionStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage
  } catch {
    return undefined
  }
}

export const adminSession = createAdminSessionStore(browserStorage(), browserH5Bridge())
