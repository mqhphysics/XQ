import { productRepository, request } from '../product/product.repository'
import { campusRepository } from '../campus/campus.repository.h5'
import { focusFinished, focusPending, selectFocusCards } from '@xiaoqiu/contracts'
import {
  nativeFocusMatches,
  nativeFocusTournaments,
} from '../../pages/index/home-display.logic.weapp'
import type { FocusMatchesDto, MatchInterestDto } from '../../../../../packages/api-client/src'

/** The server returns a ranked, account-scoped shortlist using the official result projection. */
export async function loadNativeFocusPool(tournamentId: string) {
  const data = await request<FocusMatchesDto>(
    `/public/focus-matches?tournamentId=${encodeURIComponent(tournamentId)}`,
    { refresh: true },
  )
  const ranked = selectFocusCards(data.items)
  if (
    ranked.some((match) => focusFinished(match.status)) &&
    ranked.some((match) => focusPending(match.status))
  )
    return ranked
  // Older servers may omit an entire status group from their ranked shortlist.
  try {
    const related = nativeFocusTournaments(await campusRepository.catalog(), tournamentId)
    const schedules = await Promise.all(
      related.map(async (competition) =>
        (await productRepository.getCompetitionData(competition.id)).schedule.map((match) => ({
          ...match,
          focusGender: competition.gender,
          focusCupName: competition.cupName,
        })),
      ),
    )
    return nativeFocusMatches(schedules.flat())
  } catch {
    return ranked
  }
}
export function recordNativeMatchInterest(matchId: string) {
  return request<MatchInterestDto>(`/matches/${encodeURIComponent(matchId)}/interest`, {
    method: 'PUT',
  })
}
