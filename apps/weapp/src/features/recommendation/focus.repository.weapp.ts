import { request } from '../product/product.repository'
import type { FocusMatchesDto, MatchInterestDto } from '../../../../../packages/api-client/src'

/** The server returns a ranked, account-scoped shortlist using the official result projection. */
export async function loadNativeFocusPool(tournamentId: string) {
  const data = await request<FocusMatchesDto>(
    `/public/focus-matches?tournamentId=${encodeURIComponent(tournamentId)}`,
    { refresh: true },
  )
  return data.items
}
export function recordNativeMatchInterest(matchId: string) {
  return request<MatchInterestDto>(`/matches/${encodeURIComponent(matchId)}/interest`, {
    method: 'PUT',
  })
}
