import type { CompetitionDataResponse } from '../../features/product/product.types.ts'
import { knockoutRounds } from '../../pages/data-center/knockout-display.logic.ts'
import { cupPreview } from './cup-preview.logic.ts'

export function hasReachedKnockout(data: CompetitionDataResponse) {
  const projected = cupPreview(data)
  const matches = projected.bracket.flatMap((round) => round.matches)
  if (!matches.length) return false
  if (projected.qualified.length || matches.some((match) => match.homeTeam || match.awayTeam))
    return true
  if (matches.some((match) => ['CHECK_IN', 'LIVE', 'FINISHED', 'CONFIRMED'].includes(match.status)))
    return true
  const groupMatches = data.schedule.filter(
    (match) =>
      match.stageType === 'GROUP' ||
      Boolean(match.groupName) ||
      /小组/.test(match.stageName ?? match.title),
  )
  return groupMatches.length > 0
    ? groupMatches.every((match) => ['FINISHED', 'CONFIRMED'].includes(match.status))
    : data.groups.length === 0
}

export function mobileCupRounds(data: CompetitionDataResponse) {
  const projected = cupPreview(data)
  const result = knockoutRounds({ ...data, bracket: projected.bracket })
  return {
    ...result,
    qualified: projected.qualified,
    preview: projected.preview,
    rounds: result.rounds.map((round) => ({
      ...round,
      matches: [...round.matches].sort((a, b) =>
        a.matchCode.localeCompare(b.matchCode, 'en', { numeric: true }),
      ),
    })),
  }
}

export const mobileFourCupNodes = [
  { round: 0, match: 0, left: 20, top: 40, width: 60, height: 128 },
  { round: 1, match: 0, left: 18, top: 200, width: 64, height: 140 },
  { round: 0, match: 1, left: 20, top: 372, width: 60, height: 128 },
] as const

export const mobileCupNodes = [
  { round: 0, match: 0, left: 0, top: 40, width: 48, height: 128 },
  { round: 0, match: 1, left: 52, top: 40, width: 48, height: 128 },
  { round: 1, match: 0, left: 20, top: 200, width: 60, height: 128 },
  { round: 2, match: 0, left: 18, top: 348, width: 64, height: 140 },
  { round: 1, match: 1, left: 20, top: 508, width: 60, height: 128 },
  { round: 0, match: 2, left: 0, top: 668, width: 48, height: 128 },
  { round: 0, match: 3, left: 52, top: 668, width: 48, height: 128 },
] as const
