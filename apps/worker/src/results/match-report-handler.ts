import { PermanentJobError, type ClaimedJob, type SqlExecutor } from '../outbox/outbox-store'

export interface MatchReportConfirmedEvent {
  matchId: string
  tournamentId: string
  confirmedReportVersion: number
  revisionId: string
  ruleVersionId: string
}

export interface ConfirmationHead {
  organizationId: string
  matchId: string
  tournamentId: string
  confirmedReportVersion: number | null
}

export interface ConfirmedRevision {
  organizationId: string
  matchId: string
  tournamentId: string
  version: number
  revisionId: string
  ruleVersionId: string
  status: 'CONFIRMED'
  fields: unknown
  stageId?: string | null
  groupId?: string | null
  homeTeamId?: string | null
  awayTeamId?: string | null
  playedAt?: Date | string
  resultRules?: unknown
  roundId?: string | null
  scheduledStartAt?: Date | string | null
}

export interface ResultProjectionRepository {
  // Must lock the organization-scoped Match row on the SAME transaction client.
  lockConfirmationHead(
    tx: SqlExecutor,
    organizationId: string,
    matchId: string,
  ): Promise<ConfirmationHead | null>
  getConfirmedRevision(
    tx: SqlExecutor,
    organizationId: string,
    matchId: string,
    version: number,
  ): Promise<ConfirmedRevision | null>
  // Must be idempotent for an identical revision and forbid overwriting a newer source version.
  writeProjection(tx: SqlExecutor, revision: ConfirmedRevision): Promise<void>
}

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
function rejectUnless(condition: unknown, code: string): asserts condition {
  if (!condition) throw new PermanentJobError(code)
}

export function parseConfirmedEvent(job: ClaimedJob): MatchReportConfirmedEvent {
  rejectUnless(
    job.topic === 'match.report' &&
      job.eventType === 'MatchReportConfirmed' &&
      job.aggregateType === 'Match',
    'INVALID_RESULT_EVENT_ENVELOPE',
  )
  rejectUnless(
    typeof job.organizationId === 'string' && uuid.test(job.organizationId),
    'INVALID_RESULT_ORGANIZATION',
  )
  rejectUnless(
    typeof job.payload === 'object' && job.payload !== null && !Array.isArray(job.payload),
    'INVALID_RESULT_EVENT_PAYLOAD',
  )
  const payload = job.payload as Record<string, unknown>
  for (const key of ['matchId', 'tournamentId', 'revisionId', 'ruleVersionId']) {
    rejectUnless(
      typeof payload[key] === 'string' && uuid.test(payload[key]),
      'INVALID_RESULT_EVENT_PAYLOAD',
    )
  }
  rejectUnless(
    typeof payload.confirmedReportVersion === 'number' &&
      Number.isInteger(payload.confirmedReportVersion) &&
      payload.confirmedReportVersion > 0 &&
      payload.confirmedReportVersion <= 2147483647,
    'INVALID_RESULT_EVENT_VERSION',
  )
  rejectUnless(
    job.aggregateId.toLowerCase() === String(payload.matchId).toLowerCase(),
    'RESULT_AGGREGATE_MISMATCH',
  )
  return {
    matchId: String(payload.matchId).toLowerCase(),
    tournamentId: String(payload.tournamentId).toLowerCase(),
    revisionId: String(payload.revisionId).toLowerCase(),
    ruleVersionId: String(payload.ruleVersionId).toLowerCase(),
    confirmedReportVersion: payload.confirmedReportVersion,
  }
}

export function createMatchReportHandler(
  repository: ResultProjectionRepository,
): (tx: SqlExecutor, job: ClaimedJob) => Promise<void> {
  return async (tx, job) => {
    const event = parseConfirmedEvent(job)
    const head = await repository.lockConfirmationHead(tx, job.organizationId!, event.matchId)
    rejectUnless(head !== null, 'RESULT_MATCH_NOT_FOUND')
    rejectUnless(
      head.organizationId === job.organizationId &&
        head.matchId === event.matchId &&
        head.tournamentId === event.tournamentId,
      'RESULT_SCOPE_MISMATCH',
    )
    if (head.confirmedReportVersion === null) throw new Error('CONFIRMED_RESULT_NOT_VISIBLE')
    // Fences different jobs for the same match, independently of Outbox lease tokens.
    if (event.confirmedReportVersion < head.confirmedReportVersion) return
    if (event.confirmedReportVersion > head.confirmedReportVersion)
      throw new Error('CONFIRMED_RESULT_NOT_VISIBLE')
    const revision = await repository.getConfirmedRevision(
      tx,
      job.organizationId!,
      event.matchId,
      event.confirmedReportVersion,
    )
    if (revision === null) throw new Error('CONFIRMED_RESULT_REVISION_MISSING')
    rejectUnless(
      revision.organizationId === job.organizationId &&
        revision.matchId === event.matchId &&
        revision.tournamentId === event.tournamentId &&
        revision.version === event.confirmedReportVersion &&
        revision.revisionId === event.revisionId &&
        revision.ruleVersionId === event.ruleVersionId &&
        revision.status === 'CONFIRMED',
      'CONFIRMED_RESULT_REVISION_MISMATCH',
    )
    await repository.writeProjection(tx, revision)
  }
}
