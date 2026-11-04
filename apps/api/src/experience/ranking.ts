export interface StandingsTeam {
  id: string
  name: string
  shortName: string
  primaryColor: string | null
}

export interface StandingsMatch {
  homeTeamId: string
  awayTeamId: string
  homeScore: number
  awayScore: number
  isLive: boolean
  startedAt: Date
}

export interface StandingsRow extends StandingsTeam {
  rank: number
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  form: Array<'W' | 'D' | 'L'>
  provisional: boolean
}

export function calculateStandings(
  teams: StandingsTeam[],
  matches: StandingsMatch[],
): StandingsRow[] {
  const rows = new Map<string, StandingsRow>(
    teams.map((team) => [
      team.id,
      {
        ...team,
        rank: 0,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        form: [],
        provisional: false,
      },
    ]),
  )

  for (const match of [...matches].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())) {
    const home = rows.get(match.homeTeamId)
    const away = rows.get(match.awayTeamId)
    if (!home || !away) continue

    home.played += 1
    away.played += 1
    home.goalsFor += match.homeScore
    home.goalsAgainst += match.awayScore
    away.goalsFor += match.awayScore
    away.goalsAgainst += match.homeScore
    home.provisional ||= match.isLive
    away.provisional ||= match.isLive

    if (match.homeScore > match.awayScore) {
      home.won += 1
      home.points += 3
      away.lost += 1
      home.form.push('W')
      away.form.push('L')
    } else if (match.homeScore < match.awayScore) {
      away.won += 1
      away.points += 3
      home.lost += 1
      home.form.push('L')
      away.form.push('W')
    } else {
      home.drawn += 1
      away.drawn += 1
      home.points += 1
      away.points += 1
      home.form.push('D')
      away.form.push('D')
    }
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      goalDifference: row.goalsFor - row.goalsAgainst,
      form: row.form.slice(-5),
    }))
    .sort(
      (left, right) =>
        right.points - left.points ||
        right.goalDifference - left.goalDifference ||
        right.goalsFor - left.goalsFor ||
        left.name.localeCompare(right.name, 'zh-CN'),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }))
}
