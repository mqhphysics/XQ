import { request, invalidateNativeProductReads } from '../product/product.repository'
import { readSession } from '../product/session'
import { feedUuid } from '../recommendation/feed.weapp'
import type { AuthUser } from '../product/product.types'
export const gettingStartedId = feedUuid
export interface GettingStartedData {
  user: AuthUser
  completed: boolean
  players: Array<{
    id: string
    name: string
    avatarUrl: string | null
    portraitUrl: string | null
    collegeName: string
    academicYear: string
    teamNames: string[]
  }>
  captainTeams: Array<{ id: string; name: string }>
  newlyInheritedTeamIds: string[]
}
const post = <T>(path: string, data: unknown) =>
  request<T>('/me/getting-started/' + path, { method: 'POST', data })
export const gettingStartedApi = {
  read: () => request<GettingStartedData>('/me/getting-started', { refresh: true }),
  match: async (clientActionId = gettingStartedId()) => {
    const fingerprint = (user: AuthUser | undefined) =>
      JSON.stringify(
        user
          ? {
              ...user,
              roles: [...user.roles].sort((a, b) =>
                (a.role + a.scopeId).localeCompare(b.role + b.scopeId),
              ),
              updatedAt: undefined,
            }
          : null,
      )
    const before = fingerprint(readSession()?.user)
    const value = await post<GettingStartedData>('match', { clientActionId })
    if (before !== fingerprint(value.user)) invalidateNativeProductReads()
    return value
  },
  claim: (playerId: string, clientActionId: string) =>
    post<GettingStartedData>('player', { playerId, clientActionId }),
  complete: (clientActionId: string, outcome: 'DONE' | 'SKIPPED') =>
    post<{ saved: true }>('complete', { clientActionId, outcome }),
}
export const gettingStartedEvent = 'xiaoqiu:getting-started:request'
