import type { CompetitionDataResponse, MatchSummary } from '../../features/product/product.types'
import { fixtureRoundKind } from '@xiaoqiu/contracts'
import { leagueShortDate, leagueTime } from '../../features/product/league-time.ts'

export function knockoutMatchTime(value: string | null, compact = false): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '时间待定'
  // Android WeChat does not always provide Intl; the league uses UTC+8 all year.
  const date = leagueShortDate(value)
  return compact ? date : `${date} ${leagueTime(value)}`
}

export function matchWinnerId(match: MatchSummary): string | null {
  if (
    !['FINISHED', 'CONFIRMED'].includes(match.status) ||
    match.homeScore === null ||
    match.awayScore === null
  )
    return null
  if (match.homeScore > match.awayScore) return match.homeTeam?.id ?? null
  if (match.awayScore > match.homeScore) return match.awayTeam?.id ?? null
  if (
    match.homePenaltyScore === null ||
    match.awayPenaltyScore === null ||
    match.homePenaltyScore === match.awayPenaltyScore
  )
    return null
  return match.homePenaltyScore > match.awayPenaltyScore
    ? (match.homeTeam?.id ?? null)
    : (match.awayTeam?.id ?? null)
}

export function knockoutRounds(data: CompetitionDataResponse) {
  const rounds = data.bracket
    .map((round) => ({ ...round, matches: round.matches.filter((match) => !isThirdPlace(match)) }))
    .filter((round) => round.matches.length > 0)
    .sort((a, b) => a.number - b.number)
  const thirdPlace = data.bracket.flatMap((round) => round.matches).find(isThirdPlace)
  return {
    rounds,
    thirdPlace,
    eightTeam:
      rounds.length === 3 &&
      rounds[0]?.matches.length === 4 &&
      rounds[1]?.matches.length === 2 &&
      rounds[2]?.matches.length === 1,
  }
}

function isThirdPlace(match: MatchSummary) {
  return fixtureRoundKind(match) === 'third'
}
