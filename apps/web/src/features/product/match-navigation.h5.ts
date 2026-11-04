import { matchRequestFromUrl, readMatchRequest } from '../readonly-match/navigation.logic'

export const OPEN_MATCH_EVENT = 'xiaoqiu:open-match'

export async function openMatch(matchId: string, tournamentId = ''): Promise<void> {
  const request = readMatchRequest({ matchId, tournamentId })
  if (request) window.dispatchEvent(new CustomEvent(OPEN_MATCH_EVENT, { detail: request }))
}

export function openMatchFromUrl(url: string): boolean {
  const request = matchRequestFromUrl(url)
  if (!request) return false
  void openMatch(request.matchId, request.tournamentId)
  return true
}
