import { type ResultFact, type ResultScope } from './competition-rules'

// Adapter boundary only. Persisted schemas and HTTP contracts belong to the integrator.
export interface ReportResultInput extends ResultScope {
  matchId: string
  reportVersion: number
  reportStatus: 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'CONFIRMED'
  outcome: 'FINISHED' | 'ABANDONED' | 'HOME_FORFEIT' | 'AWAY_FORFEIT' | 'BOTH_FORFEIT'
  homeTeamId: string
  awayTeamId: string
  playedAt: Date
  homeScore: number | null
  awayScore: number | null
  homePenaltyScore: number | null
  awayPenaltyScore: number | null
}

export function adaptReportResult(input: ReportResultInput): ResultFact {
  return {
    organizationId: input.organizationId,
    tournamentId: input.tournamentId,
    stageId: input.stageId,
    groupId: input.groupId,
    id: input.matchId,
    revision: input.reportVersion,
    status:
      input.outcome === 'ABANDONED'
        ? 'VOID'
        : input.reportStatus === 'CONFIRMED'
          ? 'CONFIRMED'
          : input.reportStatus === 'SUBMITTED'
            ? 'PENDING_REVIEW'
            : 'DRAFT',
    decision:
      input.outcome === 'FINISHED' || input.outcome === 'ABANDONED' ? 'PLAYED' : input.outcome,
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    playedAt: input.playedAt,
    homeScore: input.homeScore,
    awayScore: input.awayScore,
    homePenaltyScore: input.homePenaltyScore,
    awayPenaltyScore: input.awayPenaltyScore,
  }
}
