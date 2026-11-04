import { requireRule, type ResultFact } from './competition-rules'

export interface ConfirmedResultRow {
  roundId: string | null
  scheduledStartAt: Date | null
  organizationId: string
  tournamentId: string
  stageId: string | null
  groupId: string | null
  id: string
  homeTeamId: string | null
  awayTeamId: string | null
  confirmedReportVersion: number | null
  reportRevisionId: string | null
  ruleVersionId: string | null
  fields: unknown
  playedAt: Date
  projectionSourceVersion: number | null
  projectionRevisionId: string | null
  projectionPayload: unknown
}

// Never return an arbitrary cached JSON object. Rebuild from the CURRENT immutable confirmation.
export function confirmedResultFact(
  row: ConfirmedResultRow,
): (ResultFact & { ruleVersionId: string }) | null {
  if (row.confirmedReportVersion === null) return null
  requireRule(
    row.stageId && row.homeTeamId && row.awayTeamId && row.reportRevisionId && row.ruleVersionId,
    'INVALID_CONFIRMED_CONTEXT',
  )
  requireRule(
    typeof row.fields === 'object' && row.fields !== null && !Array.isArray(row.fields),
    'INVALID_CONFIRMED_FIELDS',
  )
  const fields = row.fields as Record<string, unknown>
  if (fields._liveReport === true) return null
  const frozen = fields._matchContext
  const context = {
    organizationId: row.organizationId,
    matchId: row.id,
    tournamentId: row.tournamentId,
    stageId: row.stageId,
    groupId: row.groupId,
    roundId: row.roundId,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    scheduledStartAt: row.scheduledStartAt?.toISOString() ?? null,
  }
  requireRule(
    frozen &&
      typeof frozen === 'object' &&
      !Array.isArray(frozen) &&
      Object.entries(context).every(
        ([key, value]) => (frozen as Record<string, unknown>)[key] === value,
      ),
    'CONFIRMED_MATCH_CONTEXT_CHANGED',
  )
  requireRule(
    ['FINISHED', 'ABANDONED', 'HOME_FORFEIT', 'AWAY_FORFEIT', 'BOTH_FORFEIT'].includes(
      String(fields.outcome),
    ),
    'INVALID_RESULT_OUTCOME',
  )
  function score(key: string): number | null {
    const value = fields[key]
    if (value === '' || value === undefined || value === null) return null
    requireRule(typeof value === 'string' && /^\d+$/.test(value), 'INVALID_RESULT_SCORE')
    const parsed = Number(value)
    requireRule(Number.isSafeInteger(parsed) && parsed <= 2147483647, 'INVALID_RESULT_SCORE')
    return parsed
  }
  return {
    organizationId: row.organizationId,
    tournamentId: row.tournamentId,
    stageId: row.stageId,
    groupId: row.groupId,
    id: row.id,
    revision: row.confirmedReportVersion,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    playedAt: row.playedAt,
    status: fields.outcome === 'ABANDONED' ? 'VOID' : 'CONFIRMED',
    decision:
      fields.outcome === 'FINISHED' || fields.outcome === 'ABANDONED'
        ? 'PLAYED'
        : (fields.outcome as ResultFact['decision']),
    homeScore: score('homeScore'),
    awayScore: score('awayScore'),
    homePenaltyScore: score('homePenaltyScore'),
    awayPenaltyScore: score('awayPenaltyScore'),
    ruleVersionId: row.ruleVersionId,
  }
}
