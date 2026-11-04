import { hasPublishedPositions, type MatchLineup, type PlayerMatchEvents } from './lineup.logic.ts'

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

export function createLineupDisplay(
  starters: Player[],
  arrangeUnknown = false,
  events?: ReadonlyMap<string, PlayerMatchEvents>,
) {
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
  if (
    arrangeUnknown &&
    starters.length &&
    starters.length <= 8 &&
    (starters.some((player) => !isLane(player.position)) ||
      new Set(starters.map((player) => player.position)).size === 1 ||
      PITCH_LANES.some(
        (lane) => starters.filter((player) => player.position === lane).length > 4,
      ) ||
      !starters.some((player) => player.position === 'GOALKEEPER') ||
      starters.some(
        (player) =>
          player.position === 'GOALKEEPER' &&
          (player.isCaptain ||
            events?.get(player.id)?.goals.length ||
            events?.get(player.id)?.off.length),
      ))
  ) {
    const remaining = [...starters]
    const eligible = remaining.filter(
      (player) =>
        !player.isCaptain &&
        !events?.get(player.id)?.goals.length &&
        !events?.get(player.id)?.off.length,
    )
    const keeperCandidates = eligible.length ? eligible : remaining
    const keeper =
      keeperCandidates.find((player) => player.position === 'GOALKEEPER') ??
      keeperCandidates.find((player) => ['1', '0', '00'].includes(player.shirtNumber ?? '')) ??
      keeperCandidates.find((player) => player.shirtNumber === '55') ??
      keeperCandidates[0]!
    remaining.splice(remaining.indexOf(keeper), 1)
    const scorers = [...remaining]
      .filter((player) => events?.get(player.id)?.goals.length)
      .sort((a, b) => events!.get(b.id)!.goals.length - events!.get(a.id)!.goals.length)
    remaining.sort((a, b) => Number(scorers.includes(b)) - Number(scorers.includes(a)))
    const slots: Array<{ lane: PitchLane; point: { x: number; y: number } }> = [
      { lane: 'GOALKEEPER', point: { x: 50, y: 12 } },
    ]
    const twoForwards =
      remaining.filter((player) => [7, 9, 10, 11].includes(Number(player.shirtNumber))).length >= 2
    const forwards = Math.min(3, Math.max(twoForwards ? 2 : 1, scorers.length))
    for (const [lane, count, y] of [
      ['DEFENDER', forwards > 1 ? 2 : 3, 37],
      ['MIDFIELDER', forwards === 3 ? 2 : 3, 63],
      ['FORWARD', forwards, 88],
    ] as const)
      for (let i = 0; i < count; i++)
        slots.push({ lane, point: { x: ((i + 1) * 100) / (count + 1), y } })
    const preference = (player: Player): PitchLane => {
      const scorer = scorers.indexOf(player)
      if (scorer >= 0) return scorer < 3 ? 'FORWARD' : 'MIDFIELDER'
      const number = Number(player.shirtNumber)
      return [7, 9, 10, 11].includes(number)
        ? 'FORWARD'
        : [2, 3, 4, 5].includes(number)
          ? 'DEFENDER'
          : isLane(player.position) && player.position !== 'GOALKEEPER'
            ? player.position
            : 'MIDFIELDER'
    }
    const placed = [{ player: keeper, ...slots[0]! }]
    for (const slot of [
      ...slots.slice(1).filter((slot) => slot.lane === 'FORWARD'),
      ...slots.slice(1).filter((slot) => slot.lane === 'MIDFIELDER'),
      ...slots.slice(1).filter((slot) => slot.lane === 'DEFENDER'),
    ]) {
      if (!remaining.length) break
      const preferred = remaining.findIndex((player) => preference(player) === slot.lane)
      placed.push({ player: remaining.splice(preferred < 0 ? 0 : preferred, 1)[0]!, ...slot })
    }
    return { source: 'DEFAULT' as const, keeperId: keeper.id, players: placed }
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
