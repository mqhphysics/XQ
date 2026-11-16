import type {
  CompetitionDataResponse,
  MatchSummary,
  TeamSummary,
} from '../../features/product/product.types'
import { defaultGroupCrossing } from '@xiaoqiu/contracts'
import { knockoutRounds } from '../../pages/data-center/knockout-display.logic.ts'

export type CupMatchView = MatchSummary & { preview?: true }
export interface QualifiedCupTeam {
  team: TeamSummary
  group: string
  rank: number | null
}
const finished = (match: MatchSummary) =>
  (!match.resultStatus || match.resultStatus === 'CONFIRMED') &&
  ['FINISHED', 'CONFIRMED'].includes(match.status) &&
  match.homeScore !== null &&
  match.awayScore !== null
const groupKey = (name: string) => name.replace(/\s|组/g, '').toUpperCase()

export function cupQualifyingPlaces(data: CompetitionDataResponse) {
  if (data.qualification?.qualifiersPerGroup) return data.qualification.qualifiersPerGroup
  const first = knockoutRounds(data).rounds[0]
  const places = first && data.groups.length ? (first.matches.length * 2) / data.groups.length : 2
  return Number.isInteger(places) && places >= 1 && places <= 2 ? places : 2
}

/** Point ties remain open while fixtures remain: no guessed goal differences or head-to-head. */
export function qualifiedCupTeams(data: CompetitionDataResponse): QualifiedCupTeam[] {
  const places = cupQualifyingPlaces(data)
  const teams = new Map<string, TeamSummary>()
  for (const match of data.schedule)
    for (const team of [match.homeTeam, match.awayTeam]) if (team) teams.set(team.id, team)
  const scoring = data.qualification?.points ?? { win: 3, draw: 1, loss: 0 }
  const outcomes: Array<[number, number]> = [
    [scoring.win, scoring.loss],
    [scoring.draw, scoring.draw],
    [scoring.loss, scoring.win],
  ]
  const forfeit = data.qualification?.forfeit
  if (forfeit && forfeit.loserPoints !== scoring.loss)
    outcomes.push([scoring.win, forfeit.loserPoints], [forfeit.loserPoints, scoring.win])
  if (forfeit?.both) outcomes.push([forfeit.both.points, forfeit.both.points])
  return data.groups.flatMap((group) => {
    const rows = group.standings
    if (rows.length < 2 || rows.some((row) => row.isLive)) return []
    const ids = new Map(rows.map((row, index) => [row.teamId, index]))
    const matches = data.schedule.filter(
      (match) =>
        match.stageType === 'GROUP' &&
        match.homeTeam &&
        match.awayTeam &&
        ids.has(match.homeTeam.id) &&
        ids.has(match.awayTeam.id),
    )
    // A complete published single round robin is required before using remaining-game bounds.
    const pairs = new Set(matches.map((m) => [m.homeTeam!.id, m.awayTeam!.id].sort().join(':')))
    if (matches.length !== (rows.length * (rows.length - 1)) / 2 || pairs.size !== matches.length)
      return []
    const remaining = matches.filter((match) => !finished(match))
    if (remaining.length === matches.length) return []
    if (remaining.length && (outcomes.length ** remaining.length > 60000 || rows.length > 6))
      return []
    const points = rows.map((row) => row.points)
    const best = rows.map(() => Infinity),
      worst = rows.map(() => 0)
    const inspect = () => {
      rows.forEach((row, i) => {
        const above = points.filter((value, j) => j !== i && value > points[i]!).length
        const tied = points.filter((value, j) => j !== i && value === points[i]!).length
        const low = remaining.length ? above + 1 : row.rank
        const high = remaining.length
          ? above + tied + 1
          : row.rank + rows.filter((r) => r.rank === row.rank).length - 1
        best[i] = Math.min(best[i]!, low)
        worst[i] = Math.max(worst[i]!, high)
      })
    }
    const visit = (index: number) => {
      const match = remaining[index]
      if (!match) return inspect()
      const home = ids.get(match.homeTeam!.id)!,
        away = ids.get(match.awayTeam!.id)!
      for (const [h, a] of outcomes) {
        points[home]! += h
        points[away]! += a
        visit(index + 1)
        points[home]! -= h
        points[away]! -= a
      }
    }
    visit(0)
    return rows.flatMap((row, i) => {
      const team = teams.get(row.teamId)
      return team && worst[i]! <= places
        ? [{ team, group: groupKey(group.name), rank: best[i] === worst[i] ? best[i]! : null }]
        : []
    })
  })
}

/** A standard crossing provides placeholders until the administrator publishes a draw. */
export function cupPreview(data: CompetitionDataResponse) {
  const qualified = qualifiedCupTeams(data)
  if (data.bracket.some((round) => round.matches.length)) {
    const { rounds, thirdPlace } = knockoutRounds(data)
    const count = rounds[0]?.matches.length ?? 0
    const total = count === 4 ? 3 : count === 2 ? 2 : 0
    if (
      total &&
      rounds.length < total &&
      rounds.every((r, i) => r.matches.length === count / 2 ** i)
    ) {
      const bracket = rounds.map((r) => ({ ...r, matches: [...r.matches] as CupMatchView[] }))
      while (bracket.length < total) {
        const previous = bracket.at(-1)!,
          nextCount = previous.matches.length / 2
        const name = nextCount === 1 ? '决赛' : '半决赛'
        bracket.push({
          id: `preview:${data.tournament.id}:${name}`,
          name,
          number: previous.number + 1,
          matches: Array.from(
            { length: nextCount },
            (_, i): CupMatchView => ({
              id: `preview:${data.tournament.id}:${name}:${i}`,
              tournamentId: data.tournament.id,
              matchCode: `PREVIEW-${name}-${i}`,
              title: name,
              status: 'SCHEDULED',
              scheduledStartAt: null,
              homeTeam: null,
              awayTeam: null,
              homePlaceholder: `${previous.name}${i * 2 + 1}胜者`,
              awayPlaceholder: `${previous.name}${i * 2 + 2}胜者`,
              homeScore: null,
              awayScore: null,
              homePenaltyScore: null,
              awayPenaltyScore: null,
              statusReason: null,
              venue: null,
              stageType: 'KNOCKOUT',
              preview: true,
            }),
          ),
        })
      }
      if (thirdPlace) bracket.at(-1)!.matches.push(thirdPlace)
      return { bracket, qualified, preview: false }
    }
    return { bracket: data.bracket, qualified, preview: false }
  }
  const groupIds = data.groups.map((group) => groupKey(group.name)).sort()
  const crossings = defaultGroupCrossing(groupIds, cupQualifyingPlaces(data))
  if (!qualified.length || !crossings.length || new Set(groupIds).size !== groupIds.length)
    return { bracket: data.bracket, qualified, preview: false }
  const make = (
    code: string,
    title: string,
    homePlaceholder: string,
    awayPlaceholder: string,
    homeTeam: TeamSummary | null = null,
    awayTeam: TeamSummary | null = null,
  ): CupMatchView => ({
    id: `preview:${data.tournament.id}:${code}`,
    tournamentId: data.tournament.id,
    matchCode: code,
    title,
    status: 'SCHEDULED',
    scheduledStartAt: null,
    homeTeam,
    awayTeam,
    homePlaceholder,
    awayPlaceholder,
    homeScore: null,
    awayScore: null,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    statusReason: null,
    venue: null,
    stageType: 'KNOCKOUT',
    preview: true,
  })
  const teamAt = (group: string, rank: number) =>
    qualified.find((entry) => entry.group === group && entry.rank === rank)?.team ?? null
  const bracket: Array<{ id: string; name: string; number: number; matches: CupMatchView[] }> = []
  for (let count = crossings.length; count >= 1; count /= 2) {
    const number = bracket.length + 1
    const name = count === 1 ? '决赛' : count === 2 ? '半决赛' : count === 4 ? '八强赛' : '十六强赛'
    const previous = bracket.at(-1)
    const matches = previous
      ? Array.from({ length: count }, (_, i) =>
          make(
            `R${number}-${i + 1}`,
            name,
            `${previous.name}${i * 2 + 1}胜者`,
            `${previous.name}${i * 2 + 2}胜者`,
          ),
        )
      : crossings.map(([home, away], i) =>
          make(
            `R${number}-${i + 1}`,
            name,
            `${home.groupId}组第${home.rank}`,
            `${away.groupId}组第${away.rank}`,
            teamAt(home.groupId, home.rank),
            teamAt(away.groupId, away.rank),
          ),
        )
    if (count === 1 && previous)
      matches.push(make('THIRD', '三四名赛', '半决赛1负者', '半决赛2负者'))
    bracket.push({ id: `preview-round-${number}`, name, number, matches })
  }
  return { bracket, qualified, preview: true }
}
