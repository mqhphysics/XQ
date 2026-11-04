export interface MatchRequest {
  matchId: string
  tournamentId: string
}

export function readMatchRequest(input: unknown): MatchRequest | null {
  if (!input || typeof input !== 'object' || !('matchId' in input)) return null
  if (typeof input.matchId !== 'string' || !input.matchId || input.matchId.length > 150) return null
  const tournamentId = 'tournamentId' in input ? input.tournamentId : undefined
  if (tournamentId != null && (typeof tournamentId !== 'string' || tournamentId.length > 150))
    return null
  return {
    matchId: input.matchId,
    tournamentId: typeof tournamentId === 'string' ? tournamentId : '',
  }
}

export function matchRequestFromUrl(url: string): MatchRequest | null {
  const [path, query] = url.split('?')
  if (path !== '/pages/readonly-match-detail/index') return null
  const params = new URLSearchParams(query)
  return readMatchRequest({
    matchId: params.get('matchId'),
    tournamentId: params.get('tournamentId'),
  })
}

export const MATCH_HISTORY_KEY = 'xiaoqiuMatchOverlay'
type OverlayState = Record<string, unknown>
function stateRecord(state: unknown): OverlayState {
  return state != null && typeof state === 'object' && !Array.isArray(state) ? { ...state } : {}
}

export function createMatchOverlayHistory(
  history: Pick<History, 'state' | 'pushState' | 'replaceState' | 'back'>,
  owner: string,
  onChange: (request: MatchRequest | null) => void,
) {
  let closing = false
  const current = () => {
    const marker = stateRecord(history.state)[MATCH_HISTORY_KEY]
    return marker &&
      typeof marker === 'object' &&
      'owner' in marker &&
      marker.owner === owner &&
      'request' in marker
      ? readMatchRequest(marker.request)
      : null
  }
  const releaseEntry = () => {
    if (!current()) return
    const state = stateRecord(history.state)
    delete state[MATCH_HISTORY_KEY]
    history.replaceState(state, '')
  }
  return {
    open(request: MatchRequest) {
      if (closing) return
      const previous = current()
      if (previous?.matchId === request.matchId && previous.tournamentId === request.tournamentId)
        return
      const state = { ...stateRecord(history.state), [MATCH_HISTORY_KEY]: { owner, request } }
      // No URL change: Taro keeps the source page, filters and scroll position.
      if (previous) history.replaceState(state, '')
      else history.pushState(state, '')
      onChange(request)
    },
    close() {
      if (closing) return
      // The popstate acknowledgement removes the dialog. Reopening before the
      // acknowledgement cannot create an extra history entry or stale response.
      if (current()) {
        closing = true
        history.back()
      } else onChange(null)
    },
    pop() {
      closing = false
      onChange(current())
    },
    prepareResourceNavigation() {
      // Keep the clicked resource button mounted until its bubble handler runs.
      closing = false
      releaseEntry()
    },
    routeChanged() {
      closing = false
      releaseEntry()
      onChange(null)
    },
  }
}
