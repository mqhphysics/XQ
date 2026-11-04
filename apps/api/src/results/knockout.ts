import {
  requireRule,
  resolveScore,
  validateFact,
  validateRules,
  type CompetitionRules,
  type ResultFact,
  type ResultScope,
} from './competition-rules'

export function resolveKnockoutResult(
  scope: ResultScope,
  fact: ResultFact,
  rules: CompetitionRules,
):
  | {
      status: 'READY'
      winnerTeamId: string
      loserTeamId: string
      decidedBy: 'SCORE' | 'SHOOTOUT' | 'FORFEIT'
      revision: number
      ruleVersionId: string
    }
  | {
      status: 'BLOCKED'
      reason: 'UNCONFIRMED_RESULT' | 'DRAW_REQUIRES_DECISION' | 'BOTH_FORFEIT_REQUIRES_RULING'
    } {
  validateRules(rules)
  validateFact(fact, scope)
  if (fact.status !== 'CONFIRMED') return { status: 'BLOCKED', reason: 'UNCONFIRMED_RESULT' }
  if (fact.decision === 'BOTH_FORFEIT')
    return { status: 'BLOCKED', reason: 'BOTH_FORFEIT_REQUIRES_RULING' }
  const score = resolveScore(fact, rules)
  requireRule(
    score.shootoutWinnerTeamId === null || rules.knockoutShootout === 'ALLOWED',
    'KNOCKOUT_SHOOTOUT_NOT_ALLOWED',
  )
  const winnerTeamId = score.winnerTeamId ?? score.shootoutWinnerTeamId
  if (!winnerTeamId) return { status: 'BLOCKED', reason: 'DRAW_REQUIRES_DECISION' }
  return {
    status: 'READY',
    winnerTeamId,
    loserTeamId: winnerTeamId === fact.homeTeamId ? fact.awayTeamId : fact.homeTeamId,
    decidedBy:
      fact.decision !== 'PLAYED' ? 'FORFEIT' : score.shootoutWinnerTeamId ? 'SHOOTOUT' : 'SCORE',
    revision: fact.revision,
    ruleVersionId: rules.ruleVersionId,
  }
}
