// Internal calculation inputs. These are not HTTP or persisted report contracts.
export interface ResultScope {
  organizationId: string
  tournamentId: string
  stageId: string
  groupId: string | null
}

export interface ResultFact extends ResultScope {
  id: string
  revision: number
  status: 'CONFIRMED' | 'PENDING_REVIEW' | 'LIVE' | 'DRAFT' | 'VOID'
  homeTeamId: string
  awayTeamId: string
  playedAt: Date
  // Includes extra time; excludes the penalty shoot-out.
  homeScore: number | null
  awayScore: number | null
  homePenaltyScore?: number | null
  awayPenaltyScore?: number | null
  decision: 'PLAYED' | 'HOME_FORFEIT' | 'AWAY_FORFEIT' | 'BOTH_FORFEIT'
}

export interface CompetitionRules {
  ruleVersionId: string
  points: { win: number; draw: number; loss: number }
  tieBreakers: Array<'GOAL_DIFFERENCE' | 'GOALS_FOR' | 'HEAD_TO_HEAD'>
  headToHead: {
    criteria: Array<'POINTS' | 'GOAL_DIFFERENCE' | 'GOALS_FOR'>
    reapplyToRemainingTeams: boolean
  }
  groupShootout: 'REJECT' | 'COUNT_AS_DRAW'
  knockoutShootout: 'ALLOWED' | 'DISABLED'
  forfeit: {
    winnerGoals: number
    loserGoals: number
    loserPoints: number
    both: { goals: number; points: number } | null
  }
}

export class CompetitionRuleError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'CompetitionRuleError'
  }
}

export function requireRule(condition: unknown, code: string): asserts condition {
  if (!condition) throw new CompetitionRuleError(code)
}

export function requireInteger(value: number, code: string, allowNegative = false): void {
  requireRule(Number.isSafeInteger(value) && (allowNegative || value >= 0), code)
}

export function validateRules(rules: CompetitionRules): void {
  requireRule(rules.ruleVersionId.trim().length > 0, 'RULE_VERSION_REQUIRED')
  for (const points of Object.values(rules.points)) requireInteger(points, 'INVALID_POINTS')
  requireInteger(rules.forfeit.winnerGoals, 'INVALID_FORFEIT_SCORE')
  requireInteger(rules.forfeit.loserGoals, 'INVALID_FORFEIT_SCORE')
  requireRule(rules.forfeit.winnerGoals > rules.forfeit.loserGoals, 'INVALID_FORFEIT_SCORE')
  requireInteger(rules.forfeit.loserPoints, 'INVALID_FORFEIT_POINTS', true)
  if (rules.forfeit.both) {
    requireInteger(rules.forfeit.both.goals, 'INVALID_FORFEIT_SCORE')
    requireInteger(rules.forfeit.both.points, 'INVALID_FORFEIT_POINTS', true)
  }
  requireRule(
    rules.tieBreakers.every((key) =>
      ['GOAL_DIFFERENCE', 'GOALS_FOR', 'HEAD_TO_HEAD'].includes(key),
    ) && new Set(rules.tieBreakers).size === rules.tieBreakers.length,
    'INVALID_TIE_BREAKERS',
  )
  requireRule(
    rules.headToHead.criteria.every((key) =>
      ['POINTS', 'GOAL_DIFFERENCE', 'GOALS_FOR'].includes(key),
    ) &&
      new Set(rules.headToHead.criteria).size === rules.headToHead.criteria.length &&
      (!rules.tieBreakers.includes('HEAD_TO_HEAD') || rules.headToHead.criteria.length > 0),
    'INVALID_HEAD_TO_HEAD_RULES',
  )
  requireRule(
    typeof rules.headToHead.reapplyToRemainingTeams === 'boolean',
    'INVALID_HEAD_TO_HEAD_RULES',
  )
  requireRule(['REJECT', 'COUNT_AS_DRAW'].includes(rules.groupShootout), 'INVALID_SHOOTOUT_RULE')
  requireRule(['ALLOWED', 'DISABLED'].includes(rules.knockoutShootout), 'INVALID_SHOOTOUT_RULE')
}

export function validateFact(fact: ResultFact, scope: ResultScope): void {
  requireRule(
    fact.organizationId === scope.organizationId &&
      fact.tournamentId === scope.tournamentId &&
      fact.stageId === scope.stageId &&
      fact.groupId === scope.groupId,
    'RESULT_SCOPE_MISMATCH',
  )
  requireRule(fact.id.length > 0, 'RESULT_ID_REQUIRED')
  requireInteger(fact.revision, 'INVALID_RESULT_REVISION')
  requireRule(fact.revision > 0, 'INVALID_RESULT_REVISION')
  requireRule(fact.homeTeamId.length > 0 && fact.awayTeamId.length > 0, 'TEAM_REQUIRED')
  requireRule(fact.homeTeamId !== fact.awayTeamId, 'SAME_TEAM_MATCH')
  requireRule(Number.isFinite(fact.playedAt.getTime()), 'INVALID_MATCH_TIME')
  requireRule(
    ['CONFIRMED', 'PENDING_REVIEW', 'LIVE', 'DRAFT', 'VOID'].includes(fact.status),
    'INVALID_RESULT_STATUS',
  )
}

export interface ResolvedScore {
  homeGoals: number
  awayGoals: number
  homePoints: number
  awayPoints: number
  winnerTeamId: string | null
  shootoutWinnerTeamId: string | null
}

export function resolveScore(fact: ResultFact, rules: CompetitionRules): ResolvedScore {
  const homePenalty = fact.homePenaltyScore ?? null
  const awayPenalty = fact.awayPenaltyScore ?? null
  const hasPenalties = homePenalty !== null || awayPenalty !== null
  requireRule(
    ['PLAYED', 'HOME_FORFEIT', 'AWAY_FORFEIT', 'BOTH_FORFEIT'].includes(fact.decision),
    'INVALID_RESULT_DECISION',
  )
  if (fact.decision !== 'PLAYED') {
    requireRule(!hasPenalties, 'FORFEIT_WITH_SHOOTOUT')
    if (fact.decision === 'BOTH_FORFEIT') {
      requireRule(rules.forfeit.both !== null, 'BOTH_FORFEIT_REQUIRES_RULING')
      return {
        homeGoals: rules.forfeit.both.goals,
        awayGoals: rules.forfeit.both.goals,
        homePoints: rules.forfeit.both.points,
        awayPoints: rules.forfeit.both.points,
        winnerTeamId: null,
        shootoutWinnerTeamId: null,
      }
    }
    const homeWins = fact.decision === 'AWAY_FORFEIT'
    return {
      homeGoals: homeWins ? rules.forfeit.winnerGoals : rules.forfeit.loserGoals,
      awayGoals: homeWins ? rules.forfeit.loserGoals : rules.forfeit.winnerGoals,
      homePoints: homeWins ? rules.points.win : rules.forfeit.loserPoints,
      awayPoints: homeWins ? rules.forfeit.loserPoints : rules.points.win,
      winnerTeamId: homeWins ? fact.homeTeamId : fact.awayTeamId,
      shootoutWinnerTeamId: null,
    }
  }
  requireRule(fact.homeScore !== null && fact.awayScore !== null, 'MISSING_RESULT_SCORE')
  requireInteger(fact.homeScore, 'INVALID_RESULT_SCORE')
  requireInteger(fact.awayScore, 'INVALID_RESULT_SCORE')
  const winnerTeamId =
    fact.homeScore === fact.awayScore
      ? null
      : fact.homeScore > fact.awayScore
        ? fact.homeTeamId
        : fact.awayTeamId
  let shootoutWinnerTeamId: string | null = null
  if (hasPenalties) {
    requireRule(homePenalty !== null && awayPenalty !== null, 'INCOMPLETE_SHOOTOUT')
    requireInteger(homePenalty, 'INVALID_SHOOTOUT_SCORE')
    requireInteger(awayPenalty, 'INVALID_SHOOTOUT_SCORE')
    requireRule(winnerTeamId === null, 'SHOOTOUT_REQUIRES_DRAW')
    requireRule(homePenalty !== awayPenalty, 'UNDECIDED_SHOOTOUT')
    shootoutWinnerTeamId = homePenalty > awayPenalty ? fact.homeTeamId : fact.awayTeamId
  }
  return {
    homeGoals: fact.homeScore,
    awayGoals: fact.awayScore,
    homePoints:
      winnerTeamId === null
        ? rules.points.draw
        : winnerTeamId === fact.homeTeamId
          ? rules.points.win
          : rules.points.loss,
    awayPoints:
      winnerTeamId === null
        ? rules.points.draw
        : winnerTeamId === fact.awayTeamId
          ? rules.points.win
          : rules.points.loss,
    winnerTeamId,
    shootoutWinnerTeamId,
  }
}
