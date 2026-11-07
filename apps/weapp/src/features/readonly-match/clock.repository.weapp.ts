import { request } from '../product/product.repository'
import type { MatchClockSnapshot } from './clock.logic.weapp'
export const matchClockRepository = {
  load: (matchId: string) =>
    request<MatchClockSnapshot>(`/public/matches/${encodeURIComponent(matchId)}/clock`, {
      refresh: true,
    }),
  start: (matchId: string, clientActionId: string) =>
    request<MatchClockSnapshot>(`/matches/${encodeURIComponent(matchId)}/start`, {
      method: 'POST',
      data: { clientActionId },
    }),
}
