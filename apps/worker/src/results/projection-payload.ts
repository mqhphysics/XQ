import { PermanentJobError } from '../outbox/outbox-store'
import { type ConfirmedRevision } from './match-report-handler'

export function buildResultProjectionPayload(revision: ConfirmedRevision): Record<string, unknown> {
  if (
    !revision.stageId ||
    !revision.homeTeamId ||
    !revision.awayTeamId ||
    revision.homeTeamId === revision.awayTeamId
  )
    throw new PermanentJobError('INVALID_RESULT_PARTICIPANTS')
  if (!revision.fields || typeof revision.fields !== 'object' || Array.isArray(revision.fields))
    throw new PermanentJobError('INVALID_CONFIRMED_FIELDS')
  const fields = revision.fields as Record<string, unknown>
  const currentContext = {
    organizationId: revision.organizationId,
    matchId: revision.matchId,
    tournamentId: revision.tournamentId,
    stageId: revision.stageId ?? null,
    groupId: revision.groupId ?? null,
    roundId: revision.roundId ?? null,
    homeTeamId: revision.homeTeamId ?? null,
    awayTeamId: revision.awayTeamId ?? null,
    scheduledStartAt:
      revision.scheduledStartAt == null ? null : new Date(revision.scheduledStartAt).toISOString(),
  }
  const frozen = fields._matchContext
  if (
    !frozen ||
    typeof frozen !== 'object' ||
    Array.isArray(frozen) ||
    Object.entries(currentContext).some(
      ([key, value]) => (frozen as Record<string, unknown>)[key] !== value,
    )
  )
    throw new PermanentJobError('CONFIRMED_MATCH_CONTEXT_CHANGED')
  if (
    !['FINISHED', 'ABANDONED', 'HOME_FORFEIT', 'AWAY_FORFEIT', 'BOTH_FORFEIT'].includes(
      String(fields.outcome),
    )
  )
    throw new PermanentJobError('INVALID_RESULT_OUTCOME')
  const outcome = String(fields.outcome)
  const playedAt =
    revision.playedAt instanceof Date ? revision.playedAt : new Date(revision.playedAt ?? '')
  if (!Number.isFinite(playedAt.getTime())) throw new PermanentJobError('INVALID_RESULT_DATE')
  function score(key: string): number | null {
    const value = fields[key]
    if (value === '' || value === null || value === undefined) return null
    if (typeof value !== 'string' || !/^\d+$/.test(value))
      throw new PermanentJobError('INVALID_RESULT_SCORE')
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed) || parsed > 2147483647)
      throw new PermanentJobError('INVALID_RESULT_SCORE')
    return parsed
  }
  let homeScore = score('homeScore')
  let awayScore = score('awayScore')
  const homePenaltyScore = score('homePenaltyScore')
  const awayPenaltyScore = score('awayPenaltyScore')
  if (outcome === 'FINISHED' && (homeScore === null || awayScore === null))
    throw new PermanentJobError('MISSING_RESULT_SCORE')
  if ((homePenaltyScore === null) !== (awayPenaltyScore === null))
    throw new PermanentJobError('INCOMPLETE_SHOOTOUT')
  if (
    homePenaltyScore !== null &&
    (outcome !== 'FINISHED' || homeScore !== awayScore || homePenaltyScore === awayPenaltyScore)
  )
    throw new PermanentJobError('INVALID_SHOOTOUT_RESULT')
  if (['HOME_FORFEIT', 'AWAY_FORFEIT', 'BOTH_FORFEIT'].includes(outcome)) {
    const recordedHome = homeScore
    const recordedAway = awayScore
    const rules = revision.resultRules as
      | {
          forfeit?: {
            winnerGoals?: unknown
            loserGoals?: unknown
            both?: { goals?: unknown } | null
          }
        }
      | undefined
    const award = rules?.forfeit
    const validGoals = (value: unknown): value is number =>
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647
    if (
      !award ||
      !validGoals(award.winnerGoals) ||
      !validGoals(award.loserGoals) ||
      award.winnerGoals <= award.loserGoals
    )
      throw new PermanentJobError('FORFEIT_RULES_REQUIRED')
    if (outcome === 'BOTH_FORFEIT') {
      if (!validGoals(award.both?.goals))
        throw new PermanentJobError('BOTH_FORFEIT_REQUIRES_RULING')
      homeScore = award.both.goals
      awayScore = award.both.goals
    } else {
      homeScore = outcome === 'AWAY_FORFEIT' ? award.winnerGoals : award.loserGoals
      awayScore = outcome === 'HOME_FORFEIT' ? award.winnerGoals : award.loserGoals
    }
    if (recordedHome !== homeScore || recordedAway !== awayScore)
      throw new PermanentJobError('FORFEIT_SCORE_MISMATCH')
  }
  return {
    organizationId: revision.organizationId,
    tournamentId: revision.tournamentId,
    stageId: revision.stageId,
    groupId: revision.groupId ?? null,
    id: revision.matchId,
    revision: revision.version,
    status: outcome === 'ABANDONED' ? 'VOID' : 'CONFIRMED',
    decision: outcome === 'FINISHED' || outcome === 'ABANDONED' ? 'PLAYED' : outcome,
    homeTeamId: revision.homeTeamId,
    awayTeamId: revision.awayTeamId,
    playedAt: playedAt.toISOString(),
    homeScore,
    awayScore,
    homePenaltyScore,
    awayPenaltyScore,
    ruleVersionId: revision.ruleVersionId,
  }
}
