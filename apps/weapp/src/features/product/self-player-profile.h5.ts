import { request } from './product.repository'
export interface SelfPlayerProfile {
  id: string
  updatedAt: string
  displayName: string
  jerseyName: string | null
  position: string | null
  secondaryPosition: string | null
  dominantFoot: string | null
  heightCm: number | null
  academicYear: string | null
  major: string | null
  hometown: string | null
  bio: string | null
  profileColor: string | null
  ratingShooting: number | null
  ratingSpeed: number | null
  ratingDribbling: number | null
  ratingPassing: number | null
  ratingDefending: number | null
}
export const selfPlayerProfile = {
  read: () => request<SelfPlayerProfile>('/me/player-profile'),
  save: (
    playerId: string,
    expectedUpdatedAt: string,
    patch: Partial<Omit<SelfPlayerProfile, 'id' | 'updatedAt'>>,
    key: string,
  ) =>
    request<SelfPlayerProfile>('/me/player-profile', {
      method: 'PUT',
      data: { playerId, expectedUpdatedAt, patch },
      headers: { 'Idempotency-Key': key },
    }),
}
