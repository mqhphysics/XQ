import {
  requireRule,
  resolveScore,
  validateFact,
  validateRules,
  type CompetitionRules,
  type ResultFact,
} from '../results/competition-rules'

export interface OfficialTeamRecord {
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
  goalDifference: number
}

/** The caller supplies the tournament-scoped latest facts and their approved rules. */
export function calculateOfficialTeamRecord(
  teamId: string,
  facts: ResultFact[],
  rules: CompetitionRules,
): OfficialTeamRecord {
  validateRules(rules)
  requireRule(teamId.length > 0, 'TEAM_REQUIRED')
  const seen = new Set<string>()
  const record = {
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  }

  for (const fact of facts) {
    validateFact(fact, fact)
    requireRule(!seen.has(fact.id), 'DUPLICATE_RESULT')
    seen.add(fact.id)
    if (fact.status !== 'CONFIRMED' || (fact.homeTeamId !== teamId && fact.awayTeamId !== teamId)) {
      continue
    }

    const score = resolveScore(fact, rules)
    const isHome = fact.homeTeamId === teamId
    const goalsFor = isHome ? score.homeGoals : score.awayGoals
    const goalsAgainst = isHome ? score.awayGoals : score.homeGoals
    record.played += 1
    record.goalsFor += goalsFor
    record.goalsAgainst += goalsAgainst
    record.points += isHome ? score.homePoints : score.awayPoints
    if (fact.decision === 'BOTH_FORFEIT' || goalsFor < goalsAgainst) record.lost += 1
    else if (goalsFor > goalsAgainst) record.won += 1
    else record.drawn += 1
  }

  return { ...record, goalDifference: record.goalsFor - record.goalsAgainst }
}
