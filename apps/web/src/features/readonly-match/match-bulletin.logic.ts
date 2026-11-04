export const MATCH_BULLETIN_CODES = [
  'GC26-A-R1-01',
  'GC26-A-R2-01',
  'GC26-B-R1-02',
  'GC26-SF-01',
] as const

export function hasMatchBulletin(matchCode: string): boolean {
  return (MATCH_BULLETIN_CODES as readonly string[]).includes(matchCode)
}

const GOAL_TYPES = new Set(['GOAL', 'PENALTY_SCORED', 'OWN_GOAL'])

export function isGoalEventType(type: string): boolean {
  return GOAL_TYPES.has(type)
}

/** Partial paper records must not invent intermediate or half-time scores. */
export function hasCompleteGoalTimeline(match: {
  status: string
  homeTeam: { id: string } | null
  homeScore: number | null
  awayScore: number | null
  events: Array<{ type: string; team: { id: string } }>
}): boolean {
  if (!['FINISHED', 'CONFIRMED', 'COMPLETED'].includes(match.status)) return true
  let home = 0,
    away = 0
  for (const event of match.events)
    if (isGoalEventType(event.type)) {
      const isHome = event.team.id === match.homeTeam?.id
      if (event.type === 'OWN_GOAL' ? !isHome : isHome) home++
      else away++
    }
  return match.homeScore === home && match.awayScore === away
}

export function celebrationIndex(eventId: string, count: number): number {
  if (count <= 0) return 0
  let hash = 0
  for (let index = 0; index < eventId.length; index += 1)
    hash = (hash + eventId.charCodeAt(index) * (index + 3)) % count
  return hash
}
