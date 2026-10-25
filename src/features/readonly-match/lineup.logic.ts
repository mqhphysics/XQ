import type { MatchExperienceResponse } from '../product/product.types.ts'

export type MatchEvent = MatchExperienceResponse['events'][number]
export type MatchLineup = Omit<
  MatchExperienceResponse['lineups'][number],
  | 'players'
  | 'formation'
  | 'lineupSource'
  | 'appearanceRecorded'
  | 'confirmedVersion'
  | 'confirmedAt'
> & {
  formation?: string | null
  lineupSource?: string
  appearanceRecorded?: boolean
  confirmedVersion?: number | null
  confirmedAt?: string | null
  players: Array<
    Omit<
      MatchExperienceResponse['lineups'][number]['players'][number],
      'pitchPosition' | 'minutesPlayed'
    > & {
      pitchPosition?: { x: number; y: number } | null
      minutesPlayed: number | null
    }
  >
}

export interface PlayerMatchEvents {
  goals: string[]
  assists: string[]
  ownGoals: string[]
  yellowCards: string[]
  redCards: string[]
  on: string[]
  off: string[]
}

export function minuteLabel(event: Pick<MatchEvent, 'minute' | 'stoppageMinute'>): string {
  return `${event.minute}${event.stoppageMinute ? `+${event.stoppageMinute}` : ''}′`
}

export function orderedEvents(events: MatchEvent[]): MatchEvent[] {
  // Stable sorting preserves the API's sortOrder for simultaneous events.
  return [...events].sort(
    (left, right) =>
      left.minute - right.minute || (left.stoppageMinute ?? 0) - (right.stoppageMinute ?? 0),
  )
}

export function collectPlayerEvents(
  events: MatchEvent[],
  teamId: string,
): Map<string, PlayerMatchEvents> {
  const result = new Map<string, PlayerMatchEvents>()
  const get = (playerId: string) => {
    let item = result.get(playerId)
    if (!item) {
      item = {
        goals: [],
        assists: [],
        ownGoals: [],
        yellowCards: [],
        redCards: [],
        on: [],
        off: [],
      }
      result.set(playerId, item)
    }
    return item
  }
  for (const event of orderedEvents(events)) {
    if (event.team.id !== teamId) continue
    const minute = minuteLabel(event)
    if (event.player) {
      const player = get(event.player.id)
      switch (event.type) {
        case 'GOAL':
        case 'PENALTY_SCORED':
          player.goals.push(minute)
          break
        case 'OWN_GOAL':
          player.ownGoals.push(minute)
          break
        case 'YELLOW_CARD':
          player.yellowCards.push(minute)
          break
        case 'RED_CARD':
          player.redCards.push(minute)
          break
        case 'SUBSTITUTION':
          // A substitution is one paired event: player off, related player on.
          // Keep every transition: a substitute can enter and later leave.
          if (event.relatedPlayer) {
            player.off.push(minute)
            get(event.relatedPlayer.id).on.push(minute)
          }
          break
      }
    }
    if (event.type === 'GOAL' && event.relatedPlayer)
      get(event.relatedPlayer.id).assists.push(minute)
  }
  return result
}

export function playerEventDetails(events: PlayerMatchEvents | undefined): string[] {
  if (!events) return []
  const labels: Array<[keyof PlayerMatchEvents, string]> = [
    ['goals', '进球'],
    ['assists', '助攻'],
    ['ownGoals', '乌龙球'],
    ['on', '换上'],
    ['off', '换下'],
    ['yellowCards', '黄牌'],
    ['redCards', '红牌'],
  ]
  return labels.flatMap(([key, label]) =>
    events[key].length ? [`${label} ${events[key].join('、')}`] : [],
  )
}

export function lineupGroups(lineup: MatchLineup) {
  if (lineup.lineupSource === 'UNAVAILABLE') return { starters: [], substitutes: [] }
  // Only the explicit appearance/lineup flag defines a starter; a roster is not a lineup.
  return {
    starters: lineup.players.filter((player) => player.starter),
    substitutes: lineup.players.filter((player) => !player.starter),
  }
}

export function unavailableReason(player: MatchLineup['players'][number]): string {
  if (player.position === 'GOALKEEPER') return '受伤'
  return '停赛'
}

/** Unused backup keepers and unused last forwards are shown in 伤停, not the bench. */
export function lineupSections(lineup: MatchLineup) {
  const { starters, substitutes } = lineupGroups(lineup)
  const unavailable = substitutes.filter(
    (player) =>
      player.minutesPlayed === 0 &&
      (player.position === 'GOALKEEPER' || player.shirtNumber === '18'),
  )
  const unavailableIds = new Set(unavailable.map((player) => player.id))
  return {
    starters,
    bench: substitutes.filter((player) => !unavailableIds.has(player.id)),
    unavailable,
  }
}

function emptyEvents(): PlayerMatchEvents {
  return {
    goals: [],
    assists: [],
    ownGoals: [],
    yellowCards: [],
    redCards: [],
    on: [],
    off: [],
  }
}

function cloneEvents(events: PlayerMatchEvents): PlayerMatchEvents {
  return {
    goals: [...events.goals],
    assists: [...events.assists],
    ownGoals: [...events.ownGoals],
    yellowCards: [...events.yellowCards],
    redCards: [...events.redCards],
    on: [...events.on],
    off: [...events.off],
  }
}

/** When substitution events are missing, recover on/off minutes from recorded playing time. */
export function mergeAppearanceEvents(
  recorded: Map<string, PlayerMatchEvents>,
  lineup: MatchLineup,
): Map<string, PlayerMatchEvents> {
  const result = new Map<string, PlayerMatchEvents>()
  for (const [id, events] of recorded) result.set(id, cloneEvents(events))
  const full = Math.max(90, ...lineup.players.map((player) => player.minutesPlayed ?? 0)) || 90
  for (const player of lineup.players) {
    if (player.minutesPlayed === null || player.minutesPlayed <= 0) continue
    const current = result.get(player.id) ?? emptyEvents()
    if (player.starter && player.minutesPlayed < full && current.off.length === 0)
      current.off.push(`${player.minutesPlayed}′`)
    if (!player.starter && current.on.length === 0)
      current.on.push(`${Math.max(1, full - player.minutesPlayed)}′`)
    result.set(player.id, current)
  }
  return result
}

export function eventSide(
  event: Pick<MatchEvent, 'team'>,
  homeTeamId: string | null | undefined,
): 'home' | 'away' {
  return homeTeamId && event.team.id === homeTeamId ? 'home' : 'away'
}

export function lineupHasAppearances(lineup: MatchLineup): boolean {
  return lineup.appearanceRecorded ?? lineup.lineupSource !== 'CONFIRMED_MATCH_LINEUP'
}

export function playerAppearanceLabel(
  player: MatchLineup['players'][number],
  recorded: boolean,
  events?: PlayerMatchEvents,
): string {
  if (!recorded) return '实际出场未录入'
  if (player.minutesPlayed !== null && player.minutesPlayed > 0)
    return `${player.minutesPlayed} 分钟`
  if (player.minutesPlayed === null || player.starter || events?.on.length) return '出场分钟未提供'
  return '未出场'
}

export function hasPublishedPositions(players: MatchLineup['players']): boolean {
  return (
    players.length > 0 &&
    players.every((player) => {
      const point = player.pitchPosition
      return (
        point != null &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.x <= 100 &&
        point.y >= 0 &&
        point.y <= 100
      )
    })
  )
}
