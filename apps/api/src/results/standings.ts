import {
  requireRule,
  resolveScore,
  validateFact,
  validateRules,
  type CompetitionRules,
  type ResolvedScore,
  type ResultFact,
  type ResultScope,
} from './competition-rules'

export interface ResultStanding {
  teamId: string
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

export interface StandingsTable {
  ruleVersionId: string
  mode: 'OFFICIAL' | 'PREVIEW'
  rows: ResultStanding[]
  unresolvedTies: string[][]
  excludedMatchIds: string[]
}

type ScoredMatch = { fact: ResultFact; score: ResolvedScore }

function emptyStanding(teamId: string): ResultStanding {
  return {
    teamId,
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
  }
}

function applyScore(rows: Map<string, ResultStanding>, match: ScoredMatch): void {
  const { fact, score } = match
  for (const home of [true, false]) {
    const row = rows.get(home ? fact.homeTeamId : fact.awayTeamId)!
    const own = home ? score.homeGoals : score.awayGoals
    const other = home ? score.awayGoals : score.homeGoals
    row.played += 1
    row.goalsFor += own
    row.goalsAgainst += other
    row.goalDifference = row.goalsFor - row.goalsAgainst
    row.points += home ? score.homePoints : score.awayPoints
    row.provisional ||= fact.status !== 'CONFIRMED'
    const form =
      fact.decision === 'BOTH_FORFEIT' ? 'L' : own > other ? 'W' : own < other ? 'L' : 'D'
    if (form === 'W') row.won += 1
    else if (form === 'L') row.lost += 1
    else row.drawn += 1
    row.form.push(form)
    if (row.form.length > 5) row.form.shift()
  }
}

function splitTeams(
  teams: string[],
  rows: Map<string, ResultStanding>,
  metrics: Array<'points' | 'goalDifference' | 'goalsFor'>,
): string[][] {
  const sorted = [...teams].sort((left, right) => {
    for (const metric of metrics) {
      const difference = rows.get(right)![metric] - rows.get(left)![metric]
      if (difference !== 0) return difference
    }
    // Presentation order only. Equal sporting metrics still receive the same rank.
    return left < right ? -1 : left > right ? 1 : 0
  })
  const groups: string[][] = []
  for (const id of sorted) {
    const previous = groups.at(-1)
    if (previous && metrics.every((key) => rows.get(previous[0]!)![key] === rows.get(id)![key])) {
      previous.push(id)
    } else groups.push([id])
  }
  return groups
}

function headToHeadGroups(
  teams: string[],
  matches: ScoredMatch[],
  rules: CompetitionRules,
): string[][] {
  const members = new Set(teams)
  const miniTable = new Map(teams.map((id) => [id, emptyStanding(id)]))
  for (const match of matches) {
    if (members.has(match.fact.homeTeamId) && members.has(match.fact.awayTeamId))
      applyScore(miniTable, match)
  }
  const metrics = rules.headToHead.criteria.map((key) =>
    key === 'POINTS' ? 'points' : key === 'GOAL_DIFFERENCE' ? 'goalDifference' : 'goalsFor',
  )
  const groups = splitTeams(teams, miniTable, metrics)
  if (!rules.headToHead.reapplyToRemainingTeams || groups.length === 1) return groups
  return groups.flatMap((group) =>
    group.length === 1 ? [group] : headToHeadGroups(group, matches, rules),
  )
}

export function calculateResultStandings(
  scope: ResultScope,
  teamIds: string[],
  facts: ResultFact[],
  rules: CompetitionRules,
  mode: 'OFFICIAL' | 'PREVIEW',
): StandingsTable {
  validateRules(rules)
  requireRule(mode === 'OFFICIAL' || mode === 'PREVIEW', 'INVALID_STANDINGS_MODE')
  requireRule(
    teamIds.every((id) => id.length > 0) && new Set(teamIds).size === teamIds.length,
    'INVALID_TEAMS',
  )
  const rows = new Map(teamIds.map((id) => [id, emptyStanding(id)]))
  const seen = new Set<string>()
  const matches: ScoredMatch[] = []
  const excludedMatchIds: string[] = []
  for (const fact of facts) {
    validateFact(fact, scope)
    requireRule(!seen.has(fact.id), 'DUPLICATE_RESULT')
    seen.add(fact.id)
    requireRule(rows.has(fact.homeTeamId) && rows.has(fact.awayTeamId), 'TEAM_OUTSIDE_GROUP')
    const included =
      fact.status === 'CONFIRMED' ||
      (mode === 'PREVIEW' && ['LIVE', 'PENDING_REVIEW'].includes(fact.status))
    if (!included) {
      excludedMatchIds.push(fact.id)
      continue
    }
    const score = resolveScore(fact, rules)
    requireRule(
      score.shootoutWinnerTeamId === null || rules.groupShootout === 'COUNT_AS_DRAW',
      'GROUP_SHOOTOUT_NOT_ALLOWED',
    )
    matches.push({ fact, score })
  }
  matches.sort(
    (a, b) =>
      a.fact.playedAt.getTime() - b.fact.playedAt.getTime() ||
      a.fact.id.localeCompare(b.fact.id, 'en'),
  )
  for (const match of matches) applyScore(rows, match)
  let groups = splitTeams(teamIds, rows, ['points'])
  for (const criterion of rules.tieBreakers) {
    groups = groups.flatMap((group) => {
      if (group.length < 2) return [group]
      if (criterion === 'HEAD_TO_HEAD') return headToHeadGroups(group, matches, rules)
      return splitTeams(group, rows, [
        criterion === 'GOAL_DIFFERENCE' ? 'goalDifference' : 'goalsFor',
      ])
    })
  }
  let rank = 1
  const ordered: ResultStanding[] = []
  for (const group of groups) {
    for (const id of group) ordered.push({ ...rows.get(id)!, rank })
    rank += group.length
  }
  return {
    ruleVersionId: rules.ruleVersionId,
    mode,
    rows: ordered,
    unresolvedTies: groups.filter((group) => group.length > 1),
    excludedMatchIds: excludedMatchIds.sort(),
  }
}

export function selectGroupQualifiers(
  table: StandingsTable,
  count: number,
  stageComplete: boolean,
):
  | { status: 'READY'; teamIds: string[] }
  | {
      status: 'BLOCKED'
      reason: 'STAGE_INCOMPLETE' | 'PREVIEW_TABLE' | 'UNRESOLVED_CUTOFF'
      teamIds: string[]
    } {
  requireRule(
    Number.isSafeInteger(count) && count > 0 && count <= table.rows.length,
    'INVALID_QUALIFIER_COUNT',
  )
  if (table.mode !== 'OFFICIAL') return { status: 'BLOCKED', reason: 'PREVIEW_TABLE', teamIds: [] }
  if (!stageComplete) return { status: 'BLOCKED', reason: 'STAGE_INCOMPLETE', teamIds: [] }
  const last = table.rows[count - 1]!
  const next = table.rows[count]
  if (next?.rank === last.rank) {
    return {
      status: 'BLOCKED',
      reason: 'UNRESOLVED_CUTOFF',
      teamIds: table.rows.filter((row) => row.rank === last.rank).map((row) => row.teamId),
    }
  }
  return { status: 'READY', teamIds: table.rows.slice(0, count).map((row) => row.teamId) }
}
