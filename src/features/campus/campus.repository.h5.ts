import { productRequest } from '../product/product.repository'
import { createClientActionId } from '../product/product.repository'
export interface Catalog {
  competitions: Array<{
    id: string
    code: string
    name: string
    cupName: string
    gender: string
    sortOrder: number
  }>
  seasons: Array<{ id: string; name: string; isDemo: boolean }>
  tournaments: Array<{
    id: string
    seasonId: string
    competitionDefinitionId: string
    name: string
    status: string
  }>
}
export interface CampusProfile {
  id: string
  displayName: string
  avatarUrl: string | null
  coverUrl: string | null
  bio: string | null
  onboardingCompletedAt: string | null
  playerOfferDismissedAt: string | null
  studentVerifiedAt: string | null
  identityNeedsReview: boolean
  studentRecord: {
    id: string
    realName: string
    studentNumber: string | null
    collegeName: string
    academicYear: string
    isDemo: boolean
  } | null
  playerCandidate: { id: string; name: string; portraitUrl: string | null } | null
}
export interface ReporterQuality {
  profile: {
    id: string
    score: number
    status: string
    freezeReason: string | null
    consecutiveQualified: number
    reinstatementCount: number
    probationUntil: string | null
    cooldownUntil: string | null
  } | null
  rules: {
    initialScore: number
    freezeBelow: number
    initialPenalty: number
    reinstatedPenalty: number
    qualifiedMatchesForReward: number
    reward: number
    cooldownDays: number
    probationMinimumDays: number
  }
  entries: Array<{
    id: string
    kind: string
    delta: number
    scoreAfter: number
    reason: string
    createdAt: string
  }>
  cases: Array<{
    id: string
    status: string
    description: string
    reviewNote: string | null
    appeal: string | null
    version: number
    reviewedAt: string | null
  }>
  applications: Array<{
    id: string
    status: string
    reason: string
    reviewNote: string | null
    cooldownUntil: string | null
  }>
}
const post = <T>(path: string, data: unknown, key = createClientActionId('campus')) =>
  productRequest<T>(path, { method: 'POST', data, headers: { 'Idempotency-Key': key } })
export const campusRepository = {
  catalog: () => productRequest<Catalog>('/public/competition-catalog'),
  me: () => productRequest<CampusProfile>('/me/campus-profile'),
  onboarding: (action: string, playerId?: string) =>
    post<{ saved: boolean }>('/me/campus/onboarding', {
      action,
      ...(playerId ? { playerId } : {}),
    }),
  quality: () => productRequest<ReporterQuality>('/me/reporter-quality'),
  reinstate: (reason: string) => post('/me/reporter-reinstatements', { reason }),
  appeal: (id: string, reason: string, expectedVersion: number) =>
    post(`/me/reporter-corrections/${id}/appeal`, { reason, expectedVersion }),
  correctionContext: (matchId: string) =>
    productRequest<{
      records: Array<{ id: string; version: number; reporterName: string; createdAt: string }>
    }>(`/matches/${matchId}/correction-context`),
  correct: (
    matchId: string,
    data: { reportRevisionId: string; errorKey: string; description: string; evidence: string[] },
    key: string,
  ) => post(`/matches/${matchId}/corrections`, data, key),
}
