type Fixture = {
  id: string
  status: string
  homeTeamId: string | null
  awayTeamId: string | null
  scheduledStartAt: Date | null
  actualStartedAt?: Date | null
}
type Appearance = { matchId: string; starter: boolean; minutesPlayed: number }
type Event = {
  matchId: string
  type: string
  playerId: string | null
  relatedPlayerId: string | null
}

type Membership = { teamId: string; joinedAt: Date; removedAt: Date | null; status: string }
type Snapshot = {
  teamId: string
  lockedAt: Date | null
  entries: Array<{ playerProfileId: string }>
}

export function teamFixtureScope(
  memberships: Membership[],
  // These tournament snapshots have already been filtered to locked versions and sorted newest first.
  snapshots: Snapshot[],
): (match: Fixture) => boolean {
  const byTeam = new Map<string, Snapshot[]>()
  for (const snapshot of snapshots) {
    const versions = byTeam.get(snapshot.teamId) ?? []
    versions.push(snapshot)
    byTeam.set(snapshot.teamId, versions)
  }
  const membershipByTeam = new Map(memberships.map((membership) => [membership.teamId, membership]))
  return (match) => {
    const kickoff = match.actualStartedAt ?? match.scheduledStartAt
    return [match.homeTeamId, match.awayTeamId].some((teamId) => {
      if (teamId === null) return false
      const membership = membershipByTeam.get(teamId)
      if (
        membership?.status === 'REMOVED' &&
        (!kickoff || !membership.removedAt || kickoff >= membership.removedAt)
      )
        return false
      if (membership && (kickoff ? kickoff >= membership.joinedAt : membership.status === 'ACTIVE'))
        return true
      const versions = byTeam.get(teamId)
      if (versions?.length) {
        // The initial tournament roster applies to earlier fixtures when imported after kickoff.
        const version = kickoff
          ? (versions.find((row) => row.lockedAt && row.lockedAt <= kickoff) ?? versions.at(-1))
          : versions[0]
        return !!version?.entries.length
      }
      return false
    })
  }
}

/** A team schedule is not a claim that its entire squad played the match. */
export function playerSchedule<T extends Fixture>(
  fixtures: T[],
  belongsToTeam: (match: T) => boolean,
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
      return (
        recorded.has(match.id) ||
        participated.has(match.id) ||
        confirmedStarters.has(match.id) ||
        belongsToTeam(match)
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
