import type { AuthSession } from './product.types'

/** Storage is only a hint; AccountBoundary verifies this session with the API. */
export function isUsableStoredSession(value: unknown, now = Date.now()): value is AuthSession {
  if (typeof value !== 'object' || value === null) return false
  const session = value as Partial<AuthSession>
  const expiresAt = typeof session.expiresAt === 'string' ? Date.parse(session.expiresAt) : NaN
  return Boolean(
    typeof session.accessToken === 'string' &&
    session.accessToken.trim() &&
    typeof session.user?.id === 'string' &&
    session.user.id &&
    typeof session.user.organizationId === 'string' &&
    session.user.organizationId &&
    Number.isFinite(expiresAt) &&
    expiresAt > now,
  )
}

export function isAccountEntryRoute(route: string): boolean {
  const path = route.replace(/^#/, '').split(/[?#]/)[0]?.replace(/\/+$/, '') ?? ''
  return path === '' || path === '/' || path === '/pages/login/index'
}
