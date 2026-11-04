import type { AuthSession, AuthUser } from './product.types'
import { readSession, saveSession } from './session.h5'

export type TestRole =
  | 'STUDENT'
  | 'PLAYER'
  | 'TEAM_CAPTAIN'
  | 'TEAM_COACH'
  | 'MATCH_REPORTER'
  | 'ADMIN'
interface ControllerCredential {
  accessToken: string
  expiresAt: string
  organizationId: string
}
interface ControlState {
  controller: ControllerCredential
  currentToken: string
}
const key = 'xiaoqiu.test-role.controller.v1'

function control(): ControlState | null {
  try {
    const value: ControlState | null = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    const current = readSession()
    if (
      value &&
      current &&
      value.currentToken === current.accessToken &&
      value.controller.organizationId === current.user.organizationId &&
      Date.parse(value.controller.expiresAt) > Date.now()
    )
      return value
    sessionStorage.removeItem(key)
  } catch {
    sessionStorage.removeItem(key)
  }
  return null
}

function credential(): ControllerCredential {
  const stored = control()
  if (stored) return stored.controller
  const current = readSession()
  if (!current) throw new Error('请先登录管理账号')
  return {
    accessToken: current.accessToken,
    expiresAt: current.expiresAt,
    organizationId: current.user.organizationId,
  }
}

export function canShowTestRoles(user: AuthUser | null): boolean {
  return Boolean(
    control() ||
    user?.roles.some(
      (role) =>
        (role.role === 'ORGANIZATION_ADMIN' &&
          role.scopeType === 'ORGANIZATION' &&
          role.scopeId === user.organizationId) ||
        (role.role === 'PLATFORM_ADMIN' && role.scopeType === 'PLATFORM'),
    ),
  )
}

async function call<T>(path: string, controller: ControllerCredential, data?: unknown): Promise<T> {
  const configured = process.env.TARO_APP_API_BASE_URL?.trim().replace(/\/+$/, '')
  if (!configured) throw new Error('API 尚未配置')
  const base = configured.endsWith('/api') ? configured : `${configured}/api`
  const response = await fetch(`${base}${path}`, {
    method: data ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${controller.accessToken}`,
      'x-organization-id': controller.organizationId,
      'content-type': 'application/json',
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  })
  if (response.status === 204) return undefined as T
  const result = await response.json()
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) sessionStorage.removeItem(key)
    throw new Error(result.message ?? result.error?.message ?? '角色切换失败，请重试')
  }
  return result as T
}

export async function listTestRoles() {
  return call<{ items: Array<{ id: TestRole; label: string }> }>('/auth/test-roles', credential())
}

export async function switchTestRole(role: TestRole): Promise<void> {
  const controller = credential()
  const before = readSession()?.accessToken
  const next = await call<AuthSession>('/auth/test-roles/switch', controller, { role })
  if (readSession()?.accessToken !== before) throw new Error('账号已变更，请重新打开角色选择')
  if (role === 'ADMIN') sessionStorage.removeItem(key)
  else
    sessionStorage.setItem(
      key,
      JSON.stringify({ controller, currentToken: next.accessToken } satisfies ControlState),
    )
  saveSession(next)
  window.location.assign('/')
}

export async function endTestRoleControl(): Promise<void> {
  const stored = control()
  sessionStorage.removeItem(key)
  if (stored) await call('/auth/logout', stored.controller, {})
}
