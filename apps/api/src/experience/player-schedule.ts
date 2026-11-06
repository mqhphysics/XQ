type Fixture = { id: string; status: string; homeTeamId: string | null; awayTeamId: string | null }
type Appearance = { matchId: string; starter: boolean; minutesPlayed: number }
type Event = {
  matchId: string
  type: string
  playerId: string | null
  relatedPlayerId: string | null
}

/** A team schedule is not a claim that its entire squad played the match. */
export function playerSchedule<T extends Fixture>(
  fixtures: T[],
  teamIds: string[],
  playerId: string,
  appearances: Appearance[],
  events: Event[],
  confirmedStarters: Map<string, boolean | null> = new Map(),
) {
  const recorded = new Map(appearances.map((row) => [row.matchId, row]))
  const participated = new Set(
    events
      .filter(
        (event) =>
          ['GOAL', 'OWN_GOAL', 'SUBSTITUTION'].includes(event.type) &&
          (event.playerId === playerId || event.relatedPlayerId === playerId),
      )
      .map((event) => event.matchId),
  )
  return fixtures
    .filter((match) => {
      if (['DRAFT', 'CANCELLED'].includes(match.status)) return false
      const upcoming = ['SCHEDULED', 'CHECK_IN', 'LIVE', 'POSTPONED'].includes(match.status)
      return (
        recorded.has(match.id) ||
        participated.has(match.id) ||
        confirmedStarters.has(match.id) ||
        (upcoming &&
          [match.homeTeamId, match.awayTeamId].some((id) => id !== null && teamIds.includes(id)))
      )
    })
    .map((match) => {
      const appearance = recorded.get(match.id)
      return {
        match,
        starter: appearance?.starter ?? confirmedStarters.get(match.id) ?? null,
        minutesPlayed: appearance?.minutesPlayed ?? null,
        appearanceRecorded: !!appearance,
        participationConfirmed:
          (!!appearance && appearance.minutesPlayed > 0) ||
          participated.has(match.id) ||
          confirmedStarters.has(match.id),
      }
    })
}
