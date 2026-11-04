import { adminSession, validCredential } from './session.ts'
import type { AdminCredential } from './types'
import { parseAdminUser } from './types.ts'
import { beginAdminRequest } from './request-activity.ts'

export const ADMIN_REQUEST_TIMEOUT_MS = 15_000

export class AdminApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly requestId: string | null
  constructor(
    message: string,
    status: number,
    code: string | null = null,
    requestId: string | null = null,
  ) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

function errorResponse(value: unknown, status: number): AdminApiError {
  const payload = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return new AdminApiError(
    typeof payload.message === 'string' ? payload.message : `管理服务请求失败（${status}）。`,
    status,
    typeof payload.code === 'string' ? payload.code : null,
    typeof payload.requestId === 'string' ? payload.requestId : null,
  )
}

// The deadline includes reading the body, not just receiving response headers.
export async function readAdminResponse(
  url: string,
  init: RequestInit,
  timeoutMs = ADMIN_REQUEST_TIMEOUT_MS,
): Promise<{ response: Response; payload: unknown }> {
  const controller = new AbortController()
  const signal = init.signal
  let timedOut = false
  const cancel = () => controller.abort()
  if (signal?.aborted) cancel()
  else signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    cancel()
  }, timeoutMs)
  const finish = beginAdminRequest()
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    let payload: unknown = null
    if (response.status !== 204) {
      try {
        payload = await response.json()
      } catch (error: unknown) {
        if (controller.signal.aborted) throw error
        if (response.ok)
          throw new AdminApiError('管理服务返回了无法解析的数据，请稍后重试。', response.status)
      }
    }
    return { response, payload }
  } catch (error: unknown) {
    if (timedOut) throw new AdminApiError('管理服务响应超时，请稍后重试。', 0, 'REQUEST_TIMEOUT')
    if (signal?.aborted || error instanceof AdminApiError) throw error
    throw new AdminApiError('无法连接管理服务，请稍后重试。', 0)
  } finally {
    finish()
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}

export async function loginAdmin(
  api: string,
  organizationId: string,
  username: string,
  password: string,
): Promise<AdminCredential> {
  const { response, payload } = await readAdminResponse(`${api}/auth/login`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', 'x-organization-id': organizationId },
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) throw errorResponse(payload, response.status)
  if (!validCredential(payload))
    throw new AdminApiError('登录响应无效，请重新登录。', response.status)
  return { accessToken: payload.accessToken, expiresAt: payload.expiresAt }
}

export async function currentAdminUser(
  api: string,
  accessToken: string,
  signal?: AbortSignal,
  expectedOrganizationId?: string | null,
) {
  const { response, payload } = await readAdminResponse(`${api}/auth/me`, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}` },
    ...(signal ? { signal } : {}),
  })
  if (!response.ok) throw errorResponse(payload, response.status)
  const user = parseAdminUser(payload)
  if (expectedOrganizationId && user.organizationId !== expectedOrganizationId.toLowerCase())
    throw new AdminApiError('当前账号不属于此网站的组织，请使用本组织管理员账号。', 403)
  return user
}

export async function revokeAdminSession(api: string, accessToken: string): Promise<void> {
  const { response, payload } = await readAdminResponse(`${api}/auth/logout`, {
    method: 'POST',
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw errorResponse(payload, response.status)
}

export async function requestAdmin<T>(
  api: string,
  context: { accessToken: string; organizationId: string },
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    body?: unknown
    headers?: Record<string, string>
    signal?: AbortSignal
    timeoutMs?: number
  } = {},
): Promise<T> {
  const session = adminSession.getSnapshot()
  const token = context.accessToken
  if (
    session.credential?.accessToken !== token ||
    !session.user ||
    session.user.organizationId !== context.organizationId ||
    !validCredential(session.credential)
  ) {
    adminSession.clear(token)
    throw new AdminApiError('请先使用有效的管理员账号登录。', 401)
  }
  const { response, payload } = await readAdminResponse(
    `${api}${path}`,
    {
      method: options.method ?? 'GET',
      cache: 'no-store',
      headers: {
        ...options.headers,
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'x-organization-id': context.organizationId,
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    },
    options.timeoutMs,
  )
  const current = adminSession.getSnapshot().credential
  if (current?.accessToken !== token)
    throw new AdminApiError('账号已切换，请重新读取当前账号的数据。', 409)
  if (!validCredential(current)) {
    adminSession.clear(token)
    throw new AdminApiError('登录状态已失效，请重新登录。', 401)
  }
  if (!response.ok) {
    const error = errorResponse(payload, response.status)
    if (response.status === 401) adminSession.clear(token)
    if (response.status === 403 && path === '/admin/schedule-workbench')
      adminSession.clear(token, '当前账号没有可用的后台管理权限。')
    throw error
  }
  return payload as T
}
