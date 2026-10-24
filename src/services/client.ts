import {
  bindGetCachePersistence,
  FRESH_GET_MS,
  nativeReadKey,
  PREVIEW_GET_MS,
  productGetCache,
} from '../store/cache'
import { clearSession, readSession, subscribeToSessionWrites } from '../store/session'
import { rememberTournamentId } from '../store/tournament'
import type { AuthSession } from '../types'
import { apiRequest, cloudApiFailureMessage, cloudApiMediaUrl } from './http'

const DEFAULT_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001'
const MEDIA_CACHE_LIMIT = 500
const inFlight = new Map<string, Promise<unknown>>()
const resolvedMediaCache = new Map<string, string | undefined>()
let nativeReadGeneration = 0

bindGetCachePersistence(productGetCache)

subscribeToSessionWrites(() => {
  invalidateProductReads()
})

export class ProductApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'ProductApiError'
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  data?: unknown
  authenticated?: boolean
  headers?: Record<string, string>
  fresh?: boolean
}

function tokenDigest(token: string | undefined): string {
  if (!token) return ''
  let hash = 0x811c9dc5
  for (let index = 0; index < token.length; index++) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function nativeKey(path: string, session: AuthSession | null | undefined): string {
  return nativeReadKey(
    path,
    session?.user.organizationId ||
      process.env.TARO_APP_ORGANIZATION_ID?.trim() ||
      DEFAULT_ORGANIZATION_ID,
    session?.user.id,
    tokenDigest(session?.accessToken),
  )
}

function rememberFromBody(path: string, data: unknown): void {
  if (
    !path.startsWith('/public/home') ||
    !data ||
    typeof data !== 'object' ||
    !('tournament' in data)
  ) {
    return
  }
  rememberTournamentId((data as { tournament?: { id?: string } }).tournament?.id)
}

export function clearProductGetCache(): void {
  nativeReadGeneration++
  productGetCache.clear()
  inFlight.clear()
}

export function invalidateProductReads(): void {
  nativeReadGeneration++
  productGetCache.markStale()
}

export function peekProduct<T>(path: string): T | undefined {
  const value = productGetCache.peek<T>(nativeKey(path, readSession()), PREVIEW_GET_MS)
  if (value) rememberFromBody(path, value)
  return value
}

export function getApiBaseUrl(): string {
  const configured = process.env.TARO_APP_API_BASE_URL?.trim()
  if (!configured) {
    return 'https://walter-latter-dont-productive.trycloudflare.com/api'
  }
  const normalized = configured.replace(/\/+$/, '')
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`
}

export function getApiOrigin(): string {
  return getApiBaseUrl().replace(/\/api$/, '')
}

export function resolveMediaUrl(path: string | null | undefined): string | undefined {
  const trimmed = path?.trim()
  if (!trimmed) return undefined

  if (resolvedMediaCache.has(trimmed)) {
    return resolvedMediaCache.get(trimmed)
  }

  let resolved: string | undefined
  const cloudUrl = cloudApiMediaUrl(trimmed)
  if (cloudUrl) {
    resolved = cloudUrl
  } else if (
    /^(https?:|data:|blob:|wxfile:|file:|http:\/\/tmp\/|https:\/\/tmp\/)/i.test(trimmed)
  ) {
    resolved = trimmed
  } else {
    const base = getApiBaseUrl()
    resolved = trimmed.startsWith('/api/')
      ? `${base.replace(/\/api$/, '')}${trimmed}`
      : `${base}/${trimmed.replace(/^\/+/, '')}`
  }

  if (resolvedMediaCache.size >= MEDIA_CACHE_LIMIT) {
    const oldestKey = resolvedMediaCache.keys().next().value
    if (oldestKey !== undefined) resolvedMediaCache.delete(oldestKey)
  }
  resolvedMediaCache.set(trimmed, resolved)
  return resolved
}

export function sizedMediaUrl(
  url: string | null | undefined,
  options: number | { width: number; quality?: number },
): string | undefined {
  const resolved = resolveMediaUrl(url)
  if (!resolved) return undefined
  if (
    resolved.startsWith('data:') ||
    resolved.startsWith('blob:') ||
    !resolved.includes('/api/media/')
  ) {
    return resolved
  }
  const width = typeof options === 'number' ? options : options.width
  const separator = resolved.includes('?') ? '&' : '?'
  return `${resolved}${separator}w=${Math.max(48, Math.min(1600, Math.round(width)))}`
}

export function createClientActionId(scope: string): string {
  return `${scope}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function readEtag(header: Record<string, unknown> | undefined): string | undefined {
  if (!header) return undefined
  const value =
    header.etag ??
    header.ETag ??
    Object.entries(header).find(([k]) => k.toLowerCase() === 'etag')?.[1]
  return typeof value === 'string' && value ? value : undefined
}

function requestHeaders(
  session: AuthSession | null | undefined,
  options: RequestOptions,
  etag?: string,
): Record<string, string> {
  return {
    ...options.headers,
    'content-type': 'application/json',
    'x-organization-id':
      (session?.user.organizationId ?? process.env.TARO_APP_ORGANIZATION_ID?.trim()) ||
      DEFAULT_ORGANIZATION_ID,
    ...(options.authenticated !== false && session?.accessToken
      ? { Authorization: `Bearer ${session.accessToken}` }
      : {}),
    ...(etag ? { 'If-None-Match': etag } : {}),
  }
}

export async function requestProduct<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const session = readSession()
  const method = options.method ?? 'GET'
  const key = method === 'GET' ? nativeKey(path, session) : ''
  const cached = key ? productGetCache.read<T>(key) : undefined

  if (
    method === 'GET' &&
    !options.fresh &&
    cached &&
    !cached.dirty &&
    Date.now() - cached.at <= FRESH_GET_MS
  ) {
    rememberFromBody(path, cached.data)
    return cached.data
  }

  if (key && !options.fresh) {
    const generation = nativeReadGeneration
    const operationKey = `${generation}:${key}`
    const pending = inFlight.get(operationKey)
    if (pending) return pending as Promise<T>
    const task = fetchProduct<T>(path, key, method, session, options, cached, generation)
    inFlight.set(operationKey, task)
    void task.then(
      () => inFlight.delete(operationKey),
      () => inFlight.delete(operationKey),
    )
    return task
  }

  return fetchProduct<T>(path, key, method, session, options, cached, nativeReadGeneration)
}

async function fetchProduct<T>(
  path: string,
  key: string,
  method: NonNullable<RequestOptions['method']>,
  session: AuthSession | null | undefined,
  options: RequestOptions,
  cached: ReturnType<typeof productGetCache.read<T>>,
  generation: number,
): Promise<T> {
  const response = await apiRequest<T>({
    url: `${getApiBaseUrl()}${path}`,
    method,
    data: options.data,
    header: requestHeaders(session, options, cached?.etag),
    timeout: 8000,
  }).catch((error: unknown) => {
    const cloudFailure = cloudApiFailureMessage(error)
    if (cloudFailure) throw new ProductApiError(cloudFailure, 0)
    if (
      error &&
      typeof error === 'object' &&
      'errMsg' in error &&
      /not in.*domain list|不在.*合法域名/i.test(String(error.errMsg))
    ) {
      throw new ProductApiError('接口域名未加入微信白名单，请在右上角打开开发调试后重新进入。', 0)
    }
    throw new ProductApiError('无法连接晓球 API，请检查网络或联系管理员后重试。', 0)
  })

  const currentSession = readSession()
  if (
    session?.accessToken !== currentSession?.accessToken ||
    session?.user.organizationId !== currentSession?.user.organizationId ||
    session?.user.id !== currentSession?.user.id
  ) {
    throw new ProductApiError('账号已切换，请重新读取', 409)
  }

  if (
    method === 'GET' &&
    generation !== nativeReadGeneration &&
    response.statusCode >= 200 &&
    response.statusCode < 400
  ) {
    return requestProduct<T>(path, options)
  }

  if (response.statusCode === 304 && cached) {
    if (generation === nativeReadGeneration) {
      productGetCache.put(key, cached.data, cached.etag)
    }
    return cached.data
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    if (response.statusCode === 401 && options.authenticated !== false) {
      clearSession()
    }
    throw new ProductApiError(
      readErrorMessage(response.data, response.statusCode),
      response.statusCode,
      retryAfter(response.data),
    )
  }

  if (key && generation === nativeReadGeneration) {
    productGetCache.put(key, response.data, readEtag(response.header as Record<string, unknown>))
    rememberFromBody(path, response.data)
  } else if (method !== 'GET') {
    invalidateProductReads()
  }

  return response.data
}

function retryAfter(value: unknown): number | undefined {
  if (!value || typeof value !== 'object' || !('details' in value)) return undefined
  const details = (value as { details?: unknown }).details
  if (!details || typeof details !== 'object' || !('retryAfterSeconds' in details)) return undefined
  const seconds = Number((details as { retryAfterSeconds?: unknown }).retryAfterSeconds)
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined
}

function readErrorMessage(data: unknown, statusCode: number): string {
  if (typeof data === 'object' && data !== null) {
    if ('message' in data && typeof (data as { message?: unknown }).message === 'string') {
      return (data as { message: string }).message
    }
    if ('error' in data && typeof (data as { error?: unknown }).error === 'object' && (data as { error: unknown }).error !== null) {
      const error = (data as { error: { message?: unknown } }).error
      if (typeof error.message === 'string') return error.message
    }
  }
  return statusCode === 0 ? '无法连接晓球 API' : `请求失败（HTTP ${statusCode}）`
}