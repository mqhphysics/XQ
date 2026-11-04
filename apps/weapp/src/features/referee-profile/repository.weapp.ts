import { request } from '../product/product.repository'
export interface RefereeProfile {
  isReferee: boolean
  totalMatches: number
  refereeMatches: number
  assistantMatches: number
  fourthOfficialMatches: number
  yellowCards: number
  redCards: number
  bio: string
  matches: Array<{
    matchId: string
    tournamentId: string
    label: string
    scheduledStartAt: string | null
    roles: string[]
  }>
}
export const refereeApi = {
  read: (userId: string) =>
    request<RefereeProfile>(`/public/people/${encodeURIComponent(userId)}/referee`, {
      refresh: true,
    }),
  save: (bio: string) =>
    request<RefereeProfile>('/me/referee-profile', { method: 'PATCH', data: { bio } }),
}
export const officialRoleLabels: Record<string, string> = {
  REFEREE: '主裁判',
  ASSISTANT_REFEREE_1: '第一助理裁判',
  ASSISTANT_REFEREE_2: '第二助理裁判',
  FOURTH_OFFICIAL: '第四官员',
}
