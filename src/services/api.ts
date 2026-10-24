import { clearSession, leaveGuestMode, readSession, saveSession } from '../store/session'
import { knownTournamentId } from '../store/tournament'
import type {
  AdminIdentity,
  AuthSession,
  AuthUser,
  BadgePreferenceResponse,
  CaptainWorkspaceResponse,
  CompetitionDataResponse,
  ConversationListResponse,
  HomeResponse,
  LikeResponse,
  MatchExperienceResponse,
  MessageListResponse,
  MessageUser,
  NotificationResponse,
  PlayerDetailResponse,
  PlayerFollowsResponse,
  PostComment,
  PostDetail,
  PostSummary,
  PostTag,
  PostTagSuggestion,
  PublicPersonResponse,
  RegisterInput,
  ReportListResponse,
  ReportTargetType,
  SearchCategory,
  SearchResponse,
  TeamDashboardResponse,
  TeamPreferencesResponse,
  TeamRelationshipResponse,
} from '../types'
import {
  clearProductGetCache,
  createClientActionId,
  getApiBaseUrl,
  getApiOrigin,
  invalidateProductReads,
  peekProduct,
  ProductApiError,
  requestProduct,
  resolveMediaUrl,
  sizedMediaUrl,
} from './client'

export {
  clearProductGetCache,
  createClientActionId,
  getApiBaseUrl,
  getApiOrigin,
  invalidateProductReads,
  knownTournamentId,
  peekProduct,
  ProductApiError,
  requestProduct as productRequest,
  resolveMediaUrl,
  sizedMediaUrl,
}

function refreshStoredUser(user: AuthUser): void {
  const session = readSession()
  if (session) saveSession({ ...session, user })
}

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

export const productRepository = {
  getPublishedTournaments: (options?: { fresh?: boolean }) =>
    requestProduct<{ items: Array<{ id: string; name?: string; seasonName?: string; status?: string }> }>(
      '/public/tournaments',
      options,
    ),

  getHome: (tournamentId?: string, options?: { fresh?: boolean }) =>
    requestProduct<HomeResponse>(
      `/public/home${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
      options,
    ),

  search: (query: string, category: SearchCategory, tournamentId?: string) =>
    requestProduct<SearchResponse>(
      `/public/search?query=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}${tournamentId ? `&tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
    ),

  getCompetitionData: (tournamentId: string, options?: { fresh?: boolean }) =>
    requestProduct<CompetitionDataResponse>(
      `/public/tournaments/${encodeURIComponent(tournamentId)}/competition-data`,
      options,
    ),

  getTeamDashboard: (teamId: string, tournamentId?: string, options?: { fresh?: boolean }) =>
    requestProduct<TeamDashboardResponse>(
      `/public/teams/${encodeURIComponent(teamId)}/dashboard${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
      options,
    ),

  getPlayer: (playerId: string, tournamentId?: string, options?: { fresh?: boolean }) =>
    requestProduct<PlayerDetailResponse>(
      `/public/players/${encodeURIComponent(playerId)}${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
      options,
    ),

  getPerson: (userId: string, tournamentId?: string, options?: { fresh?: boolean }) =>
    requestProduct<PublicPersonResponse>(
      `/public/people/${encodeURIComponent(userId)}${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
      options,
    ),

  getMatch: (matchId: string, options?: { fresh?: boolean }) =>
    requestProduct<MatchExperienceResponse>(
      `/public/matches/${encodeURIComponent(matchId)}/experience`,
      options,
    ),

  getPost: (postId: string, options?: { fresh?: boolean }) =>
    requestProduct<PostDetail>(`/public/posts/${encodeURIComponent(postId)}`, options),

  getPostTagSuggestions: (query = '', tournamentId?: string) =>
    requestProduct<{ items: PostTagSuggestion[] }>(
      `/public/post-tags?query=${encodeURIComponent(query)}${tournamentId ? `&tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
    ),

  getPosts: (tournamentId?: string, options?: { fresh?: boolean }) =>
    requestProduct<{ items: PostSummary[] }>(
      `/public/posts${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
      options,
    ),

  login: async (identifier: string, password: string) => {
    const session = await requestProduct<AuthSession>('/auth/login', {
      method: 'POST',
      data: { username: identifier.trim(), password },
      authenticated: false,
    })
    saveSession(session)
    return session
  },

  register: async (input: RegisterInput) => {
    const session = await requestProduct<AuthSession>('/auth/register', {
      method: 'POST',
      data: input,
      authenticated: false,
    })
    saveSession(session)
    return session
  },

  getMe: (options?: { fresh?: boolean }) => requestProduct<AuthUser>('/auth/me', options),

  updateProfile: async (displayName: string, email: string, bio: string) => {
    const user = await requestProduct<AuthUser>('/auth/me', {
      method: 'PATCH',
      data: { displayName, email, bio },
    })
    refreshStoredUser(user)
    return user
  },

  uploadAvatar: async (dataUrl: string) => {
    const result = await requestProduct<{ user: AuthUser; avatar: { avatarUrl: string } }>(
      '/me/avatar',
      {
        method: 'PUT',
        data: { dataUrl },
      },
    )
    refreshStoredUser(result.user)
    return result
  },

  resetPasswordByIdentity: (realName: string, studentId: string, newPassword: string) =>
    requestProduct<void>('/auth/password/reset-by-identity', {
      method: 'POST',
      authenticated: false,
      data: { realName, studentId, newPassword },
    }),

  getAdminIdentities: () => requestProduct<AdminIdentity[]>('/admin/identities'),

  reviewMatch: (matchId: string, rating: number | undefined, body?: string) =>
    requestProduct<MatchExperienceResponse>(`/matches/${encodeURIComponent(matchId)}/reviews`, {
      method: 'POST',
      data: {
        ...(rating !== undefined ? { rating } : {}),
        ...(body?.trim() ? { body: body.trim() } : {}),
      },
    }),

  logout: async () => {
    try {
      await requestProduct<void>('/auth/logout', { method: 'POST' })
    } finally {
      clearSession()
      leaveGuestMode()
    }
  },

  getTeamPreferences: (tournamentId?: string, options?: { fresh?: boolean }) =>
    requestProduct<TeamPreferencesResponse>(
      `/me/team-preferences${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
      options,
    ),

  updateTeamPreferences: (primaryTeamId: string, followedTeamIds: string[]) =>
    requestProduct<TeamPreferencesResponse>('/me/team-preferences', {
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
    requestProduct<PostSummary>('/community/posts', {
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
    requestProduct<LikeResponse>(`/community/posts/${encodeURIComponent(postId)}/like`, {
      method: liked ? 'PUT' : 'DELETE',
    }),

  setPostFavorite: (postId: string, favorited: boolean) =>
    requestProduct<{ favorited: boolean }>(
      `/community/posts/${encodeURIComponent(postId)}/favorite`,
      {
        method: favorited ? 'PUT' : 'DELETE',
      },
    ),

  setCommentLike: (postId: string, commentId: string, liked: boolean) =>
    requestProduct<LikeResponse>(
      `/community/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/like`,
      {
        method: liked ? 'PUT' : 'DELETE',
      },
    ),

  updatePost: (postId: string, body: string, expectedUpdatedAt: string) =>
    requestProduct<PostDetail>(`/community/posts/${encodeURIComponent(postId)}`, {
      method: 'PATCH',
      data: { body, expectedUpdatedAt },
    }),

  deletePost: (postId: string, expectedUpdatedAt: string) =>
    requestProduct<{ deleted: boolean }>(`/community/posts/${encodeURIComponent(postId)}`, {
      method: 'DELETE',
      data: { expectedUpdatedAt },
    }),

  updateComment: (postId: string, commentId: string, body: string, expectedUpdatedAt: string) =>
    requestProduct<PostComment>(
      `/community/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
      {
        method: 'PATCH',
        data: { body, expectedUpdatedAt },
      },
    ),

  deleteComment: (postId: string, commentId: string, expectedUpdatedAt: string) =>
    requestProduct<{ deleted: boolean }>(
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
    requestProduct<PostComment>(`/community/posts/${encodeURIComponent(postId)}/comments`, {
      method: 'POST',
      data: {
        body,
        clientCommentId,
        ...(parentCommentId ? { parentCommentId } : {}),
        ...(repostToFeed ? { repostToFeed: true } : {}),
      },
    }),

  getPlayerFollows: () => requestProduct<PlayerFollowsResponse>('/me/player-follows'),
  getBadgePreference: () => requestProduct<BadgePreferenceResponse>('/me/profile-badge'),
  setBadgePreference: (preferredKind: string | null, version: number, clientActionId: string) =>
    requestProduct<BadgePreferenceResponse>('/me/profile-badge', {
      method: 'PUT',
      data: { preferredKind, version, clientActionId },
    }),
  followPlayer: (playerId: string) =>
    requestProduct<PlayerFollowsResponse>(`/me/player-follows/${encodeURIComponent(playerId)}`, {
      method: 'PUT',
    }),
  unfollowPlayer: (playerId: string) =>
    requestProduct<PlayerFollowsResponse>(`/me/player-follows/${encodeURIComponent(playerId)}`, {
      method: 'DELETE',
    }),

  getTeamRelationship: (teamId: string) =>
    requestProduct<TeamRelationshipResponse>(`/teams/${encodeURIComponent(teamId)}/relationship`),
  applyToTeam: (teamId: string, requestedPosition: string, message: string) =>
    requestProduct<TeamRelationshipResponse>(
      `/teams/${encodeURIComponent(teamId)}/join-applications`,
      {
        method: 'POST',
        data: {
          ...(requestedPosition ? { requestedPosition } : {}),
          ...(message.trim() ? { message: message.trim() } : {}),
        },
      },
    ),
  getCaptainWorkspace: (teamId: string) =>
    requestProduct<CaptainWorkspaceResponse>(`/captain/teams/${encodeURIComponent(teamId)}`),
  reviewTeamApplication: (teamId: string, applicationId: string, decision: string, note = '') =>
    requestProduct<CaptainWorkspaceResponse>(
      `/captain/teams/${encodeURIComponent(teamId)}/applications/${encodeURIComponent(applicationId)}`,
      { method: 'PUT', data: { decision, ...(note.trim() ? { note: note.trim() } : {}) } },
    ),
  updateTeamMember: (teamId: string, membershipId: string, position: string) =>
    requestProduct<CaptainWorkspaceResponse>(
      `/captain/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(membershipId)}`,
      { method: 'PUT', data: { position } },
    ),
  removeTeamMember: (teamId: string, membershipId: string) =>
    requestProduct<CaptainWorkspaceResponse>(
      `/captain/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(membershipId)}`,
      { method: 'DELETE' },
    ),

  getNotifications: () => requestProduct<NotificationResponse>('/me/notifications'),
  readNotification: (notificationId: string) =>
    requestProduct<NotificationResponse>(
      `/me/notifications/${encodeURIComponent(notificationId)}/read`,
      {
        method: 'PUT',
      },
    ),
  readAllNotifications: () =>
    requestProduct<NotificationResponse>('/me/notifications/read-all', { method: 'PUT' }),

  createReport: (
    targetType: ReportTargetType,
    reason: string,
    details: string,
    clientReportId: string,
    targetId?: string,
  ) =>
    requestProduct('/reports', {
      method: 'POST',
      data: {
        clientReportId,
        targetType,
        reason,
        ...(details.trim() ? { details: details.trim() } : {}),
        ...(targetId ? { targetId } : {}),
      },
    }),
  getMyReports: () => requestProduct<ReportListResponse>('/me/reports'),
  getAdminReports: () => requestProduct<ReportListResponse>('/admin/reports'),
  reviewReport: (reportId: string, status: string, resolution: string, hideContent: boolean) =>
    requestProduct<ReportListResponse>(`/admin/reports/${encodeURIComponent(reportId)}`, {
      method: 'PUT',
      data: { status, resolution, hideContent },
    }),

  getMessageDirectory: (query = '') =>
    requestProduct<{ items: MessageUser[] }>(
      `/messages/directory${query.trim() ? `?query=${encodeURIComponent(query.trim())}` : ''}`,
    ),
  getConversations: () => requestProduct<ConversationListResponse>('/messages/conversations'),
  getMessages: (conversationId: string) =>
    requestProduct<MessageListResponse>(
      `/messages/conversations/${encodeURIComponent(conversationId)}`,
    ),
  readConversation: (conversationId: string) =>
    requestProduct<MessageListResponse>(
      `/messages/conversations/${encodeURIComponent(conversationId)}/read`,
      { method: 'PUT' },
    ),
  sendMessage: (recipientUserId: string, body: string, clientMessageId: string) =>
    requestProduct<{ conversationId: string }>(
      `/messages/direct/${encodeURIComponent(recipientUserId)}`,
      {
        method: 'POST',
        data: { body, clientMessageId },
      },
    ),
}