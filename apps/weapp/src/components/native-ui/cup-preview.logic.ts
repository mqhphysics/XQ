import type {
  CompetitionDataResponse,
  MatchSummary,
  TeamSummary,
} from '../../features/product/product.types'
import { knockoutRounds } from '../../pages/data-center/knockout-display.logic.ts'

export type CupMatchView = MatchSummary & { preview?: true }
export interface QualifiedCupTeam {
  team: TeamSummary
  group: string
  rank: number | null
}
const finished = (match: MatchSummary) =>
  ['FINISHED', 'CONFIRMED'].includes(match.status) &&
  match.homeScore !== null &&
  match.awayScore !== null
const groupKey = (name: string) => name.replace(/\s|组/g, '').toUpperCase()

export function cupQualifyingPlaces(data: CompetitionDataResponse) {
  const first = [...data.bracket].sort((a, b) => a.number - b.number)[0]
  const places = first && data.groups.length ? (first.matches.length * 2) / data.groups.length : 2
  return Number.isInteger(places) && places >= 1 && places <= 2 ? places : 2
}

/** Point ties remain open while fixtures remain: no guessed goal differences or head-to-head. */
export function qualifiedCupTeams(data: CompetitionDataResponse): QualifiedCupTeam[] {
  const places = cupQualifyingPlaces(data)
  const teams = new Map<string, TeamSummary>()
  for (const match of data.schedule)
    for (const team of [match.homeTeam, match.awayTeam]) if (team) teams.set(team.id, team)
  return data.groups.flatMap((group) => {
    const rows = group.standings
    if (rows.length < 2 || rows.length > 6 || rows.some((row) => row.isLive)) return []
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
    if (remaining.length > 10) return []
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
      for (const [h, a] of [
        [3, 0],
        [1, 1],
        [0, 3],
      ] as const) {
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

/** Default crossing approved for the four-group men's cup; preview IDs never navigate to a match. */
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
  if (
    !/男足/.test(data.tournament.name) ||
    !qualified.length ||
    !['A', 'B', 'C', 'D'].every((key) => data.groups.some((g) => groupKey(g.name) === key))
  )
    return { bracket: data.bracket, qualified, preview: false }
  const slot = (key: string) => qualified.find((q) => q.group + q.rank === key)?.team ?? null
  const make = (
    code: string,
    title: string,
    home: string,
    away: string,
    seeded = false,
  ): CupMatchView => ({
    id: `preview:${data.tournament.id}:${code}`,
    tournamentId: data.tournament.id,
    matchCode: code,
    title,
    status: 'SCHEDULED',
    scheduledStartAt: null,
    homeTeam: seeded ? slot(home) : null,
    awayTeam: seeded ? slot(away) : null,
    homePlaceholder: seeded ? `${home[0]}组第${home[1]}` : home,
    awayPlaceholder: seeded ? `${away[0]}组第${away[1]}` : away,
    homeScore: null,
    awayScore: null,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    statusReason: null,
    venue: null,
    stageType: 'KNOCKOUT',
    preview: true,
  })
  return {
    qualified,
    preview: true,
    bracket: [
      {
        id: 'preview-quarter',
        name: '八强',
        number: 1,
        matches: [
          ['A1', 'B2'],
          ['C1', 'D2'],
          ['B1', 'A2'],
          ['D1', 'C2'],
        ].map(([home, away], i) => make(`QF${i + 1}`, `八强赛 ${i + 1}`, home!, away!, true)),
      },
      {
        id: 'preview-semi',
        name: '半决赛',
        number: 2,
        matches: [
          make('SF1', '半决赛 1', '八强1胜者', '八强2胜者'),
          make('SF2', '半决赛 2', '八强3胜者', '八强4胜者'),
        ],
      },
      {
        id: 'preview-final',
        name: '决赛',
        number: 3,
        matches: [
          make('FINAL', '决赛', '半决赛1胜者', '半决赛2胜者'),
          make('THIRD', '季军赛', '半决赛1负者', '半决赛2负者'),
        ],
      },
    ],
  }
}
