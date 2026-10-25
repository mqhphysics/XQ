import Taro from '@tarojs/taro'
import { NATIVE_FRESH_GET_MS, NATIVE_PREVIEW_GET_MS, nativeReadKey } from './native-read-policy'
import { cloudApiMediaUrl, cloudApiFailureMessage } from '../cloud-api/proxy.logic'
import { apiRequest } from '../cloud-api/request'

import {
  FRESH_GET_MS,
  STALE_GET_MS,
  knownTournamentId,
  productGetCache,
  rememberTournamentId,
} from './get-cache'
import { bindGetCacheStore } from './get-cache-store'

import { clearSession, leaveGuestMode, readSession, saveSession } from './session'
import { prepareCompetitionSelection, scopeProductPath } from './tournament-scope'
import {
  anonymousReadAllowed,
  explicitAnonymousAuthRequest,
} from '../product-config/access-boundary.logic'
import {
  clearAccountByUser,
  getConfiguration,
  markAccountInvalid,
  readAccountPresence,
} from '../product-config/policy-state'
import type {
  AdminIdentity,
  AuthSession,
  AuthUser,
  CompetitionDataResponse,
  CaptainWorkspaceResponse,
  ConversationListResponse,
  HomeResponse,
  LikeResponse,
  MessageListResponse,
  MessageUser,
  MatchExperienceResponse,
  PlayerDetailResponse,
  PublicPersonResponse,
  BadgePreferenceResponse,
  PlayerFollowsResponse,
  PostComment,
  PostDetail,
  PostSummary,
  PostTag,
  PostTagSuggestion,
  RegisterInput,
  SearchCategory,
  SearchResponse,
  NotificationResponse,
  ReportListResponse,
  ReportTargetType,
  TeamDashboardResponse,
  TeamPreferencesResponse,
  TeamRelationshipResponse,
} from './product.types'

const DEFAULT_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001'

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

export const productRepository = {
  getPublishedTournaments: () => request<{ items: Array<{ id: string }> }>('/public/tournaments'),

  getHome: (tournamentId?: string) =>
    request<HomeResponse>(
      `/public/home${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
    ),

  search: (query: string, category: SearchCategory, tournamentId?: string) =>
    request<SearchResponse>(
      `/public/search?query=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}${tournamentId ? `&tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
    ),

  getCompetitionData: (tournamentId: string) =>
    request<CompetitionDataResponse>(
      `/public/tournaments/${encodeURIComponent(tournamentId)}/competition-data`,
    ),

  getTeamDashboard: (teamId: string, tournamentId?: string) =>
    request<TeamDashboardResponse>(
      `/public/teams/${encodeURIComponent(teamId)}/dashboard${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
    ),

  getPlayer: (playerId: string, tournamentId?: string) =>
    request<PlayerDetailResponse>(
      `/public/players/${encodeURIComponent(playerId)}${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
    ),

  getPerson: (userId: string, tournamentId?: string) =>
    request<PublicPersonResponse>(
      `/public/people/${encodeURIComponent(userId)}${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
    ),

  getMatch: (matchId: string) =>
    request<MatchExperienceResponse>(`/public/matches/${encodeURIComponent(matchId)}/experience`),

  getPost: (postId: string) => request<PostDetail>(`/public/posts/${encodeURIComponent(postId)}`),

  getPostTagSuggestions: (query = '', tournamentId?: string) =>
    request<{ items: PostTagSuggestion[] }>(
      `/public/post-tags?query=${encodeURIComponent(query)}${tournamentId ? `&tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
    ),

  getPosts: (tournamentId?: string) =>
    request<{ items: PostSummary[] }>(
      `/public/posts${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
    ),

  login: async (identifier: string, password: string) => {
    const session = await request<AuthSession>('/auth/login', {
      method: 'POST',
      data: { username: identifier.trim(), password },
      authenticated: false,
    })
    saveSession(session)
    return session
  },

  register: async (input: RegisterInput) => {
    const session = await request<AuthSession>('/auth/register', {
      method: 'POST',
      data: input,
      authenticated: false,
    })
    saveSession(session)
    return session
  },

  getMe: () => request<AuthUser>('/auth/me'),

  updateProfile: async (displayName: string, email: string, bio: string) => {
    const user = await request<AuthUser>('/auth/me', {
      method: 'PATCH',
      data: { displayName, email, bio },
    })
    refreshStoredUser(user)
    return user
  },

  uploadAvatar: async (dataUrl: string) => {
    const result = await request<{ user: AuthUser; avatar: { avatarUrl: string } }>('/me/avatar', {
      method: 'PUT',
      data: { dataUrl },
    })
    refreshStoredUser(result.user)
    return result
  },

  resetPasswordByIdentity: (realName: string, studentId: string, newPassword: string) =>
    request<void>('/auth/password/reset-by-identity', {
      method: 'POST',
      authenticated: false,
      data: { realName, studentId, newPassword },
    }),

  getAdminIdentities: () => request<AdminIdentity[]>('/admin/identities'),

  reviewMatch: (matchId: string, rating: number | undefined, body?: string) =>
    request<MatchExperienceResponse>(`/matches/${encodeURIComponent(matchId)}/reviews`, {
      method: 'POST',
      data: {
        ...(rating !== undefined ? { rating } : {}),
        ...(body?.trim() ? { body: body.trim() } : {}),
      },
    }),

  logout: async () => {
    try {
      await request<void>('/auth/logout', { method: 'POST' })
    } finally {
      clearSession()
      leaveGuestMode()
      if (Taro.getEnv() === Taro.ENV_TYPE.WEB) clearAccountByUser()
    }
  },

  getTeamPreferences: (tournamentId?: string) =>
    request<TeamPreferencesResponse>(
      `/me/team-preferences${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
    ),

  updateTeamPreferences: (primaryTeamId: string, followedTeamIds: string[]) =>
    request<TeamPreferencesResponse>('/me/team-preferences', {
      method: 'PUT',
      data: { primaryTeamId, followedTeamIds },
    }),

  createPost: (
    body: string,
    clientPostId: string,
    title?: string,
    teamId?: string,
    imageDataUrl?: string,
    imageDataUrls?: string[],
    tags?: PostTag[],
    tournamentId?: string,
    quotedPostId?: string,
  ) =>
    request<PostSummary>('/community/posts', {
      method: 'POST',
      data: {
        body,
        clientPostId,
        ...(title ? { title } : {}),
        ...(teamId ? { teamId } : {}),
        ...(imageDataUrl ? { imageDataUrl } : {}),
        ...(imageDataUrls?.length ? { imageDataUrls } : {}),
        ...(tags ? { tags } : {}),
        ...(tournamentId ? { tournamentId } : {}),
        ...(quotedPostId ? { quotedPostId } : {}),
      },
    }),

  setLike: (postId: string, liked: boolean) =>
    request<LikeResponse>(`/community/posts/${encodeURIComponent(postId)}/like`, {
      method: liked ? 'PUT' : 'DELETE',
    }),

  setPostFavorite: (postId: string, favorited: boolean) =>
    request<{ favorited: boolean }>(`/community/posts/${encodeURIComponent(postId)}/favorite`, {
      method: favorited ? 'PUT' : 'DELETE',
    }),

  setCommentLike: (postId: string, commentId: string, liked: boolean) =>
    request<LikeResponse>(
      `/community/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/like`,
      {
        method: liked ? 'PUT' : 'DELETE',
      },
    ),

  updatePost: (postId: string, body: string, expectedUpdatedAt: string) =>
    request<PostDetail>(`/community/posts/${encodeURIComponent(postId)}`, {
      method: 'PATCH',
      data: { body, expectedUpdatedAt },
    }),

  deletePost: (postId: string, expectedUpdatedAt: string) =>
    request<{ deleted: boolean }>(`/community/posts/${encodeURIComponent(postId)}`, {
      method: 'DELETE',
      data: { expectedUpdatedAt },
    }),

  updateComment: (postId: string, commentId: string, body: string, expectedUpdatedAt: string) =>
    request<PostComment>(
      `/community/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
      {
        method: 'PATCH',
        data: { body, expectedUpdatedAt },
      },
    ),

  deleteComment: (postId: string, commentId: string, expectedUpdatedAt: string) =>
    request<{ deleted: boolean }>(
      `/community/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
      {
        method: 'DELETE',
        data: { expectedUpdatedAt },
      },
    ),

  createComment: (
    postId: string,
    body: string,
    clientCommentId: string,
    parentCommentId?: string,
    repostToFeed?: boolean,
  ) =>
    request<PostComment>(`/community/posts/${encodeURIComponent(postId)}/comments`, {
      method: 'POST',
      data: {
        body,
        clientCommentId,
        ...(parentCommentId ? { parentCommentId } : {}),
        ...(repostToFeed ? { repostToFeed: true } : {}),
      },
    }),

  getPlayerFollows: () => request<PlayerFollowsResponse>('/me/player-follows'),
  getBadgePreference: () => request<BadgePreferenceResponse>('/me/profile-badge'),
  setBadgePreference: (preferredKind: string | null, version: number, clientActionId: string) =>
    request<BadgePreferenceResponse>('/me/profile-badge', {
      method: 'PUT',
      data: { preferredKind, version, clientActionId },
    }),
  followPlayer: (playerId: string) =>
    request<PlayerFollowsResponse>(`/me/player-follows/${encodeURIComponent(playerId)}`, {
      method: 'PUT',
    }),
  unfollowPlayer: (playerId: string) =>
    request<PlayerFollowsResponse>(`/me/player-follows/${encodeURIComponent(playerId)}`, {
      method: 'DELETE',
    }),

  getTeamRelationship: (teamId: string) =>
    request<TeamRelationshipResponse>(`/teams/${encodeURIComponent(teamId)}/relationship`),
  applyToTeam: (teamId: string, requestedPosition: string, message: string) =>
    request<TeamRelationshipResponse>(`/teams/${encodeURIComponent(teamId)}/join-applications`, {
      method: 'POST',
      data: {
        ...(requestedPosition ? { requestedPosition } : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
      },
    }),
  getCaptainWorkspace: (teamId: string) =>
    request<CaptainWorkspaceResponse>(`/captain/teams/${encodeURIComponent(teamId)}`),
  reviewTeamApplication: (teamId: string, applicationId: string, decision: string, note = '') =>
    request<CaptainWorkspaceResponse>(
      `/captain/teams/${encodeURIComponent(teamId)}/applications/${encodeURIComponent(applicationId)}`,
      { method: 'PUT', data: { decision, ...(note.trim() ? { note: note.trim() } : {}) } },
    ),
  updateTeamMember: (teamId: string, membershipId: string, position: string) =>
    request<CaptainWorkspaceResponse>(
      `/captain/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(membershipId)}`,
      { method: 'PUT', data: { position } },
    ),
  removeTeamMember: (teamId: string, membershipId: string) =>
    request<CaptainWorkspaceResponse>(
      `/captain/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(membershipId)}`,
      { method: 'DELETE' },
    ),

  getNotifications: () => request<NotificationResponse>('/me/notifications'),
  readNotification: (notificationId: string) =>
    request<NotificationResponse>(`/me/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'PUT',
    }),
  readAllNotifications: () =>
    request<NotificationResponse>('/me/notifications/read-all', { method: 'PUT' }),

  createReport: (
    targetType: ReportTargetType,
    reason: string,
    details: string,
    clientReportId: string,
    targetId?: string,
  ) =>
    request('/reports', {
      method: 'POST',
      data: {
        clientReportId,
        targetType,
        reason,
        ...(details.trim() ? { details: details.trim() } : {}),
        ...(targetId ? { targetId } : {}),
      },
    }),
  getMyReports: () => request<ReportListResponse>('/me/reports'),
  getAdminReports: () => request<ReportListResponse>('/admin/reports'),
  reviewReport: (reportId: string, status: string, resolution: string, hideContent: boolean) =>
    request<ReportListResponse>(`/admin/reports/${encodeURIComponent(reportId)}`, {
      method: 'PUT',
      data: { status, resolution, hideContent },
    }),

  getMessageDirectory: (query = '') =>
    request<{ items: MessageUser[] }>(
      `/messages/directory${query.trim() ? `?query=${encodeURIComponent(query.trim())}` : ''}`,
    ),
  getConversations: () => request<ConversationListResponse>('/messages/conversations'),
  getMessages: (conversationId: string) =>
    request<MessageListResponse>(`/messages/conversations/${encodeURIComponent(conversationId)}`),
  readConversation: (conversationId: string) =>
    request<MessageListResponse>(
      `/messages/conversations/${encodeURIComponent(conversationId)}/read`,
      { method: 'PUT' },
    ),
  sendMessage: (recipientUserId: string, body: string, clientMessageId: string) =>
    request<{ conversationId: string }>(`/messages/direct/${encodeURIComponent(recipientUserId)}`, {
      method: 'POST',
      data: { body, clientMessageId },
    }),
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  data?: unknown
  authenticated?: boolean
  headers?: Record<string, string>
  /** Internal: viewer-independent public GET sent without the account token. */
  anonymousRead?: boolean
  /** Warm the cache only: allowed before login for viewer-independent public reads. */
  prefetch?: boolean
}

/**
 * Public reads whose body does not depend on the viewer. They are requested without the
 * account token, so one cached copy (and the server's ETag / shared cache) serves everyone,
 * including the prefetch that starts before login.
 */
const VIEWER_INDEPENDENT = [
  /^\/public\/tournaments\/[^/?]+\/competition-data(?:\?|$)/,
  /^\/public\/tournaments\/[^/?]+\/teams(?:\?|$)/,
  /^\/public\/tournaments(?:\?|$)/,
  /^\/public\/competition-catalog(?:\?|$)/,
  /^\/public\/seasons(?:\?|$)/,
]

export function viewerIndependent(path: string): boolean {
  return VIEWER_INDEPENDENT.some((pattern) => pattern.test(path))
}

/** Short stable digest so persisted cache keys never contain the bearer token itself. */
function tokenDigest(token: string | undefined): string {
  if (!token) return ''
  let hash = 0x811c9dc5
  for (let index = 0; index < token.length; index++) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function cacheKey(path: string, token?: string) {
  return viewerIndependent(path) ? `* ${path}` : `${tokenDigest(token)} ${path}`
}
function nativeKey(path: string, session: AuthSession | null | undefined) {
  return nativeReadKey(
    path,
    session?.user.organizationId ||
      process.env.TARO_APP_ORGANIZATION_ID?.trim() ||
      DEFAULT_ORGANIZATION_ID,
    session?.user.id,
    tokenDigest(session?.accessToken),
  )
}
export function peekNativeProduct<T>(path: string): T | undefined {
  if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) return undefined
  const value = productGetCache.peek<T>(nativeKey(path, readSession()), NATIVE_PREVIEW_GET_MS)
  if (value) rememberFromBody(path, value)
  return value
}
export function invalidateNativeProductReads() {
  if (Taro.getEnv() === Taro.ENV_TYPE.WEAPP) {
    nativeReadGeneration++
    productGetCache.markStale()
  }
}

bindGetCacheStore(productGetCache, { remember: rememberTournamentId, known: knownTournamentId })

const inFlight = new Map<string, Promise<unknown>>()
let nativeReadGeneration = 0

function readEtag(header: Record<string, string> | undefined): string | undefined {
  const value = header?.etag ?? header?.ETag
  return typeof value === 'string' && value ? value : undefined
}

function rememberFromBody(path: string, data: unknown) {
  if (
    !path.startsWith('/public/home') ||
    !data ||
    typeof data !== 'object' ||
    !('tournament' in data)
  )
    return
  rememberTournamentId((data as { tournament?: { id?: string } }).tournament?.id)
}

function requestHeaders(
  session: AuthSession | null | undefined,
  options: RequestOptions,
  etag?: string,
) {
  return {
    ...options.headers,
    'content-type': 'application/json',
    'x-organization-id':
      (session?.user.organizationId ?? process.env.TARO_APP_ORGANIZATION_ID?.trim()) ||
      DEFAULT_ORGANIZATION_ID,
    ...(options.authenticated !== false && session?.accessToken && !options.anonymousRead
      ? { Authorization: `Bearer ${session.accessToken}` }
      : {}),
    ...(etag ? { 'If-None-Match': etag } : {}),
  }
}

export function peekProduct<T>(path: string): T | undefined {
  if (Taro.getEnv() === Taro.ENV_TYPE.WEAPP) return peekNativeProduct<T>(path)
  if (Taro.getEnv() !== Taro.ENV_TYPE.WEB) return undefined
  path = scopeProductPath(path)
  const session = readAccountPresence()?.session
  return productGetCache.peek<T>(cacheKey(path, session?.accessToken), STALE_GET_MS)
}

/** Notifies when a cached GET whose path passes `test` is written (e.g. a silent refresh). */
export function subscribeProductUpdates(
  test: (path: string) => boolean,
  listener: () => void,
): () => void {
  if (Taro.getEnv() !== Taro.ENV_TYPE.WEB) return () => undefined
  return productGetCache.subscribe((key) => {
    if (test(key.slice(key.indexOf(' ') + 1))) listener()
  })
}

export const isCompetitionPath = (path: string) => path.includes('/competition-data')

export function peekCompetition(routeTournamentId = ''): CompetitionDataResponse | undefined {
  const id = routeTournamentId || knownTournamentId()
  if (!id) return undefined
  return peekProduct<CompetitionDataResponse>(
    `/public/tournaments/${encodeURIComponent(id)}/competition-data`,
  )
}

export async function loadCompetition(routeTournamentId = ''): Promise<CompetitionDataResponse> {
  const id = routeTournamentId || knownTournamentId()
  if (id) return productRepository.getCompetitionData(id)
  const home = await productRepository.getHome()
  return productRepository.getCompetitionData(home.tournament.id)
}

export function sizedMediaUrl(url: string | null | undefined, width: number): string | undefined {
  if (!url) return undefined
  if (url.startsWith('data:') || url.startsWith('blob:') || !url.includes('/api/media/')) return url
  const [base, search = ''] = url.split('?')
  const params = new URLSearchParams(search)
  params.set('w', String(width))
  return `${base}?${params.toString()}`
}

export { knownTournamentId }
export { request as productRequest }

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const h5 = Taro.getEnv() === Taro.ENV_TYPE.WEB
  const account = h5 ? readAccountPresence() : null
  const session = h5 ? account?.session : readSession()
  const method = options.method ?? 'GET'
  const anonymousAuth =
    options.authenticated === false && explicitAnonymousAuthRequest(path, method)
  const sharedRead = h5 && method === 'GET' && viewerIndependent(path)
  if (sharedRead) options = { ...options, anonymousRead: true }
  if (
    h5 &&
    !anonymousAuth &&
    !(h5 && method === 'GET' && options.prefetch && path.startsWith('/public/')) &&
    (!session || options.authenticated === false)
  ) {
    let allowed = false
    if (account && !account.needsAccount && !account.hasSession) {
      try {
        allowed = anonymousReadAllowed(
          path,
          method,
          await getConfiguration(),
          readAccountPresence(),
        )
      } catch {
        /* configuration unavailable closes anonymous entry */
      }
    }
    if (!allowed) throw new ProductApiError('请先登录账号后再访问晓球', 401)
  }
  if (h5) {
    await prepareCompetitionSelection(path)
    if (readAccountPresence()?.session?.accessToken !== session?.accessToken)
      throw new ProductApiError('账号已切换，请重新读取', 409)
    path = scopeProductPath(path)
  }
  const key =
    method === 'GET' ? (h5 ? cacheKey(path, session?.accessToken) : nativeKey(path, session)) : ''
  const cached = key ? productGetCache.read<T>(key) : undefined
  // Stale-while-revalidate: anything cached within a day renders now and refreshes silently.
  // Only a mutation (dirty) makes an awaited read wait for the network.
  if (
    cached &&
    !cached.dirty &&
    Date.now() - cached.at <= (h5 ? FRESH_GET_MS : NATIVE_FRESH_GET_MS)
  ) {
    rememberFromBody(path, cached.data)
    return cached.data
  }
  if (h5 && cached && !cached.dirty && Date.now() - cached.at <= STALE_GET_MS) {
    void revalidateGet<T>(path, key, session, options).catch(() => undefined)
    return cached.data
  }
  if (key) {
    const generation = h5 ? undefined : nativeReadGeneration
    const operationKey = h5 ? key : `${generation}:${key}`
    const pending = inFlight.get(operationKey)
    if (pending) return pending as Promise<T>
    const task = fetchProduct<T>(path, key, method, session, options, cached, h5, generation)
    inFlight.set(operationKey, task)
    void task.then(
      () => inFlight.delete(operationKey),
      () => inFlight.delete(operationKey),
    )
    return task
  }
  return fetchProduct<T>(path, key, method, session, options, cached, h5)
}

async function fetchProduct<T>(
  path: string,
  key: string,
  method: NonNullable<RequestOptions['method']>,
  session: AuthSession | null | undefined,
  options: RequestOptions,
  cached: ReturnType<typeof productGetCache.read<T>>,
  h5: boolean,
  nativeGeneration?: number,
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
      !h5 &&
      error &&
      typeof error === 'object' &&
      'errMsg' in error &&
      /not in.*domain list|不在.*合法域名/i.test(String(error.errMsg))
    ) {
      throw new ProductApiError('接口域名未加入微信白名单，请在右上角打开开发调试后重新进入。', 0)
    }
    throw new ProductApiError('无法连接晓球 API，请检查网络或联系管理员后重试。', 0)
  })
  const currentNativeSession = h5 ? session : readSession()
  if (
    !h5 &&
    (session?.accessToken !== currentNativeSession?.accessToken ||
      session?.user.organizationId !== currentNativeSession?.user.organizationId ||
      session?.user.id !== currentNativeSession?.user.id)
  )
    throw new ProductApiError('账号已切换，请重新读取', 409)
  if (
    !h5 &&
    method === 'GET' &&
    nativeGeneration !== nativeReadGeneration &&
    response.statusCode >= 200 &&
    response.statusCode < 400
  )
    return request<T>(path, options)
  if (response.statusCode === 304 && cached) {
    if (h5 || nativeGeneration === nativeReadGeneration)
      productGetCache.put(key, cached.data, cached.etag)
    return cached.data
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    if (response.statusCode === 401 && options.authenticated !== false && !options.anonymousRead) {
      if (h5 && session && readSession()?.accessToken === session.accessToken) markAccountInvalid()
      else if (!h5) clearSession()
    }
    throw new ProductApiError(
      readErrorMessage(response.data, response.statusCode),
      response.statusCode,
      retryAfter(response.data),
    )
  }
  if (key && (h5 || nativeGeneration === nativeReadGeneration)) {
    productGetCache.put(key, response.data, readEtag(response.header))
    rememberFromBody(path, response.data)
  } else if (method !== 'GET') {
    // Keep cached pages renderable (no blank tab after an action); awaited reads refetch.
    productGetCache.markStale()
    if (!h5) nativeReadGeneration++
  }
  return response.data
}

function retryAfter(value: unknown): number | undefined {
  if (!value || typeof value !== 'object' || !('details' in value)) return undefined
  const details = value.details
  if (!details || typeof details !== 'object' || !('retryAfterSeconds' in details)) return undefined
  const seconds = Number(details.retryAfterSeconds)
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined
}

async function revalidateGet<T>(
  path: string,
  key: string,
  session: AuthSession | null | undefined,
  options: RequestOptions,
) {
  if (inFlight.has(key)) return
  const cached = productGetCache.read<T>(key)
  const task = (async () => {
    const response = await apiRequest<T>({
      url: `${getApiBaseUrl()}${path}`,
      method: 'GET',
      header: requestHeaders(session, options, cached?.etag),
      timeout: 8000,
    })
    if (response.statusCode === 304 && cached) {
      productGetCache.put(key, cached.data, cached.etag)
      return cached.data
    }
    if (response.statusCode >= 200 && response.statusCode < 300) {
      productGetCache.put(key, response.data, readEtag(response.header))
      rememberFromBody(path, response.data)
      return response.data
    }
    throw new ProductApiError(
      readErrorMessage(response.data, response.statusCode),
      response.statusCode,
    )
  })()
  inFlight.set(key, task)
  try {
    await task
  } finally {
    inFlight.delete(key)
  }
}

function getApiBaseUrl(): string {
  const configured = process.env.TARO_APP_API_BASE_URL?.trim()
  if (!configured) {
    throw new ProductApiError('尚未配置 API 地址。请使用 TARO_APP_API_BASE_URL 启动客户端。', 0)
  }
  const normalized = configured.replace(/\/+$/, '')
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`
}

export function resolveMediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  const cloudUrl = cloudApiMediaUrl(path)
  if (cloudUrl) return cloudUrl
  if (/^https?:\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:'))
    return path
  const base = getApiBaseUrl()
  return path.startsWith('/api/')
    ? `${base.replace(/\/api$/, '')}${path}`
    : `${base}/${path.replace(/^\/+/, '')}`
}

export function createClientActionId(scope: string): string {
  return `${scope}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function refreshStoredUser(user: AuthUser): void {
  const session = readSession()
  if (session) saveSession({ ...session, user })
}

function readErrorMessage(data: unknown, statusCode: number): string {
  if (typeof data === 'object' && data !== null) {
    if ('message' in data && typeof data.message === 'string') return data.message
    if ('error' in data && typeof data.error === 'object' && data.error !== null) {
      const error = data.error as { message?: unknown }
      if (typeof error.message === 'string') return error.message
    }
  }
  return statusCode === 0 ? '无法连接晓球 API' : `请求失败（HTTP ${statusCode}）`
}
