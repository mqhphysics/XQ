import type { MatchSummary } from '../product/product.types'

export type ScheduleFilter = 'all' | 'upcoming' | 'finished'
export type ScheduleDirection = 'asc' | 'desc'

export interface ScheduleDateGroup {
  dateKey: string
  matches: MatchSummary[]
}

export interface PropagationEvent {
  stopPropagation: () => void
}

export function filterAndSortSchedule(
  matches: MatchSummary[],
  filter: ScheduleFilter,
  direction: ScheduleDirection,
): MatchSummary[] {
  return matches
    .filter((match) => {
      if (filter === 'finished') return isFinishedMatch(match)
      if (filter === 'upcoming') {
        return ['SCHEDULED', 'CHECK_IN', 'POSTPONED'].includes(match.status)
      }
      return true
    })
    .sort((left, right) => {
      const leftTime = left.scheduledStartAt ? Date.parse(left.scheduledStartAt) : null
      const rightTime = right.scheduledStartAt ? Date.parse(right.scheduledStartAt) : null
      if (leftTime === null && rightTime === null) return left.id.localeCompare(right.id)
      if (leftTime === null) return 1
      if (rightTime === null) return -1
      const difference = leftTime - rightTime
      return direction === 'asc' ? difference : -difference
    })
}

export function groupScheduleMatches(matches: MatchSummary[]): ScheduleDateGroup[] {
  const groups = new Map<string, MatchSummary[]>()
  for (const match of matches) {
    const dateKey = match.scheduledStartAt?.slice(0, 10) ?? 'TBD'
    groups.set(dateKey, [...(groups.get(dateKey) ?? []), match])
  }
  return [...groups.entries()].map(([dateKey, groupedMatches]) => ({
    dateKey,
    matches: groupedMatches,
  }))
}

export function isFinishedMatch(match: Pick<MatchSummary, 'status'>): boolean {
  return match.status === 'FINISHED' || match.status === 'CONFIRMED'
}

export function matchDetailUrl(matchId: string): string {
  return `/pages/readonly-match-detail/index?matchId=${encodeURIComponent(matchId)}`
}

export function teamDetailUrl(
  event: PropagationEvent,
  teamId: string | null | undefined,
  tournamentId: string,
): string | null {
  if (!teamId) return null
  event.stopPropagation()
  return (
    '/pages/readonly-team-detail/index?teamId=' +
    encodeURIComponent(teamId) +
    '&tournamentId=' +
    encodeURIComponent(tournamentId)
  )
}

export interface BracketMatchLike {
  id: string
  matchCode: string
}

export interface BracketRoundLike<TMatch extends BracketMatchLike = BracketMatchLike> {
  id: string
  name: string
  matches: TMatch[]
}

export interface BracketNodeLayout {
  id: string
  matchId: string
  roundId: string
  roundIndex: number
  x: number
  y: number
  width: number
  height: number
  placement: boolean
}

export interface BracketRoundLayout {
  id: string
  name: string
  x: number
  width: number
}

export interface BracketConnectorLayout {
  id: string
  targetMatchId: string
  orientation: 'horizontal' | 'vertical'
  x: number
  y: number
  width: number
  height: number
}

export interface BracketLayout {
  width: number
  height: number
  rounds: BracketRoundLayout[]
  nodes: BracketNodeLayout[]
  connectors: BracketConnectorLayout[]
}

const BRACKET_NODE_WIDTH = 230
const BRACKET_NODE_HEIGHT = 104
const BRACKET_ROUND_GAP = 74
const BRACKET_HEADER_HEIGHT = 46
const BRACKET_ROW_HEIGHT = 118
const BRACKET_MIN_BODY_HEIGHT = 520
const BRACKET_PLACEMENT_GAP = 32

export function createBracketLayout<TMatch extends BracketMatchLike>(
  inputRounds: BracketRoundLike<TMatch>[],
): BracketLayout {
  const rounds = inputRounds.map((round) => ({
    ...round,
    mainMatches: round.matches.filter((match) => !isThirdPlaceMatch(match)).sort(compareMatchCode),
    placementMatches: round.matches.filter(isThirdPlaceMatch).sort(compareMatchCode),
  }))
  const firstRoundCount = Math.max(1, rounds[0]?.mainMatches.length ?? 1)
  const bodyHeight = Math.max(BRACKET_MIN_BODY_HEIGHT, firstRoundCount * BRACKET_ROW_HEIGHT)
  const width = Math.max(
    BRACKET_NODE_WIDTH,
    rounds.length * BRACKET_NODE_WIDTH + Math.max(0, rounds.length - 1) * BRACKET_ROUND_GAP,
  )
  const roundLayouts: BracketRoundLayout[] = []
  const nodes: BracketNodeLayout[] = []
  const centersByRound: number[][] = []

  for (const [roundIndex, round] of rounds.entries()) {
    const x = roundIndex * (BRACKET_NODE_WIDTH + BRACKET_ROUND_GAP)
    roundLayouts.push({ id: round.id, name: round.name, x, width: BRACKET_NODE_WIDTH })

    const previousCenters = centersByRound[roundIndex - 1] ?? []
    const mainCenters = round.mainMatches.map((_, matchIndex) => {
      const firstSource = previousCenters[matchIndex * 2]
      const secondSource = previousCenters[matchIndex * 2 + 1]
      if (firstSource !== undefined && secondSource !== undefined) {
        return (firstSource + secondSource) / 2
      }
      return ((matchIndex + 0.5) * bodyHeight) / Math.max(1, round.mainMatches.length)
    })
    centersByRound.push(mainCenters)

    for (const [matchIndex, match] of round.mainMatches.entries()) {
      const center = mainCenters[matchIndex]!
      nodes.push({
        id: `node:${match.id}`,
        matchId: match.id,
        roundId: round.id,
        roundIndex,
        x,
        y: BRACKET_HEADER_HEIGHT + center - BRACKET_NODE_HEIGHT / 2,
        width: BRACKET_NODE_WIDTH,
        height: BRACKET_NODE_HEIGHT,
        placement: false,
      })
    }

    const mainCenter = mainCenters[0] ?? bodyHeight / 2
    for (const [placementIndex, match] of round.placementMatches.entries()) {
      const center =
        mainCenter +
        BRACKET_NODE_HEIGHT +
        BRACKET_PLACEMENT_GAP +
        placementIndex * (BRACKET_NODE_HEIGHT + BRACKET_PLACEMENT_GAP)
      nodes.push({
        id: `node:${match.id}`,
        matchId: match.id,
        roundId: round.id,
        roundIndex,
        x,
        y: BRACKET_HEADER_HEIGHT + center - BRACKET_NODE_HEIGHT / 2,
        width: BRACKET_NODE_WIDTH,
        height: BRACKET_NODE_HEIGHT,
        placement: true,
      })
    }
  }

  const nodeByMatchId = new Map(nodes.map((node) => [node.matchId, node]))
  const connectors: BracketConnectorLayout[] = []
  for (let roundIndex = 1; roundIndex < rounds.length; roundIndex += 1) {
    const previousMatches = rounds[roundIndex - 1]!.mainMatches
    const targetMatches = rounds[roundIndex]!.mainMatches
    for (const [targetIndex, targetMatch] of targetMatches.entries()) {
      const targetNode = nodeByMatchId.get(targetMatch.id)
      if (!targetNode) continue
      const sources = previousMatches.slice(targetIndex * 2, targetIndex * 2 + 2)
      const targetCenterY = targetNode.y + targetNode.height / 2
      const targetX = targetNode.x
      const middleX = targetX - BRACKET_ROUND_GAP / 2

      for (const source of sources) {
        const sourceNode = nodeByMatchId.get(source.id)
        if (!sourceNode) continue
        const sourceX = sourceNode.x + sourceNode.width
        const sourceCenterY = sourceNode.y + sourceNode.height / 2
        connectors.push(
          horizontalConnector(
            `connector:${source.id}:${targetMatch.id}:source`,
            targetMatch.id,
            sourceX,
            middleX,
            sourceCenterY,
          ),
          verticalConnector(
            `connector:${source.id}:${targetMatch.id}:join`,
            targetMatch.id,
            middleX,
            sourceCenterY,
            targetCenterY,
          ),
        )
      }
      connectors.push(
        horizontalConnector(
          `connector:${targetMatch.id}:target`,
          targetMatch.id,
          middleX,
          targetX,
          targetCenterY,
        ),
      )
    }
  }

  return {
    width,
    height: BRACKET_HEADER_HEIGHT + bodyHeight,
    rounds: roundLayouts,
    nodes,
    connectors,
  }
}

export function isThirdPlaceMatch(match: BracketMatchLike): boolean {
  return match.matchCode.toUpperCase().includes('THIRD')
}

function compareMatchCode(left: BracketMatchLike, right: BracketMatchLike): number {
  return left.matchCode.localeCompare(right.matchCode, 'en', { numeric: true })
}

function horizontalConnector(
  id: string,
  targetMatchId: string,
  startX: number,
  endX: number,
  y: number,
): BracketConnectorLayout {
  return {
    id,
    targetMatchId,
    orientation: 'horizontal',
    x: Math.min(startX, endX),
    y,
    width: Math.abs(endX - startX),
    height: 1,
  }
}

function verticalConnector(
  id: string,
  targetMatchId: string,
  x: number,
  startY: number,
  endY: number,
): BracketConnectorLayout {
  return {
    id,
    targetMatchId,
    orientation: 'vertical',
    x,
    y: Math.min(startY, endY),
    width: 1,
    height: Math.abs(endY - startY),
  }
}
