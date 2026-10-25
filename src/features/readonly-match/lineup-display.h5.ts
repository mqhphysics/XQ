import { hasPublishedPositions, type MatchLineup } from './lineup.logic.ts'

type Player = MatchLineup['players'][number]
export type PitchLane = 'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'FORWARD'

export const PITCH_LANES: PitchLane[] = ['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD']

const LANE_START = 12
const LANE_END = 88

function isLane(value: string | null | undefined): value is PitchLane {
  return (
    value === 'GOALKEEPER' || value === 'DEFENDER' || value === 'MIDFIELDER' || value === 'FORWARD'
  )
}

/** At most one starter occupies the goalkeeper lane; extra GK profiles shift to defence. */
export function pitchLaneFor(player: Player, keeperId: string | null): PitchLane {
  if (player.position === 'GOALKEEPER') return player.id === keeperId ? 'GOALKEEPER' : 'DEFENDER'
  return isLane(player.position) ? player.position : 'MIDFIELDER'
}

export function designateGoalkeeper(starters: Player[]): string | null {
  const keepers = starters.filter((player) => player.position === 'GOALKEEPER')
  return keepers[0]?.id ?? null
}

/** Occupied rows are spaced evenly from the goal to the halfway line. */
export function depthsForLanes(occupied: PitchLane[]): Map<PitchLane, number> {
  const depths = new Map<PitchLane, number>()
  if (occupied.length === 0) return depths
  if (occupied.length === 1) {
    depths.set(occupied[0]!, occupied[0] === 'GOALKEEPER' ? LANE_START : 50)
    return depths
  }
  occupied.forEach((lane, index) => {
    depths.set(lane, LANE_START + ((LANE_END - LANE_START) * index) / (occupied.length - 1))
  })
  return depths
}

export function createLineupDisplay(starters: Player[]) {
  if (hasPublishedPositions(starters)) {
    const keeperId = designateGoalkeeper(starters)
    return {
      source: 'PUBLISHED' as const,
      keeperId,
      players: starters.map((player) => ({
        player,
        lane: pitchLaneFor(player, keeperId),
        point: player.pitchPosition!,
      })),
    }
  }
  const keeperId = designateGoalkeeper(starters)
  const groups = new Map<PitchLane, Player[]>([
    ['GOALKEEPER', []],
    ['DEFENDER', []],
    ['MIDFIELDER', []],
    ['FORWARD', []],
  ])
  for (const player of starters) groups.get(pitchLaneFor(player, keeperId))!.push(player)
  const occupied = PITCH_LANES.filter((lane) => groups.get(lane)!.length > 0)
  const depths = depthsForLanes(occupied)
  return {
    source: 'DEFAULT' as const,
    keeperId,
    players: starters.map((player) => {
      const lane = pitchLaneFor(player, keeperId)
      const group = groups.get(lane)!
      return {
        player,
        lane,
        point: {
          x: ((group.indexOf(player) + 1) * 100) / (group.length + 1),
          y: depths.get(lane) ?? 50,
        },
      }
    }),
  }
}
