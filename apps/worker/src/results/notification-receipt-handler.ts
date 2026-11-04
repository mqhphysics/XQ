import { PermanentJobError, type ClaimedJob, type SqlExecutor } from '../outbox/outbox-store'

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
function requireReceipt(condition: unknown, code: string): asserts condition {
  if (!condition) throw new PermanentJobError(code)
}

export async function matchReportNotificationReceipt(
  tx: SqlExecutor,
  job: ClaimedJob,
): Promise<void> {
  requireReceipt(
    job.topic === 'match.report.notification' &&
      job.eventType === 'MatchReportNotificationCreated' &&
      job.aggregateType === 'MatchReportRevision',
    'INVALID_NOTIFICATION_RECEIPT_EVENT',
  )
  requireReceipt(
    job.organizationId &&
      uuid.test(job.organizationId) &&
      job.payload &&
      typeof job.payload === 'object' &&
      !Array.isArray(job.payload),
    'INVALID_NOTIFICATION_RECEIPT_PAYLOAD',
  )
  const input = job.payload as Record<string, unknown>
  for (const key of ['organizationId', 'matchId', 'tournamentId', 'revisionId'])
    requireReceipt(
      typeof input[key] === 'string' && uuid.test(input[key]),
      'INVALID_NOTIFICATION_RECEIPT_PAYLOAD',
    )
  const organizationId = String(input.organizationId).toLowerCase()
  const revisionId = String(input.revisionId).toLowerCase()
  requireReceipt(
    organizationId === job.organizationId && job.aggregateId.toLowerCase() === revisionId,
    'NOTIFICATION_RECEIPT_SCOPE_MISMATCH',
  )
  requireReceipt(
    typeof input.reportVersion === 'number' &&
      Number.isInteger(input.reportVersion) &&
      input.reportVersion > 0 &&
      input.reportVersion <= 2147483647 &&
      ['SUBMIT', 'RETURN', 'CONFIRM', 'CORRECT'].includes(String(input.action)),
    'INVALID_NOTIFICATION_RECEIPT_VERSION',
  )
  function ids(value: unknown): string[] {
    requireReceipt(
      Array.isArray(value) && value.every((id) => typeof id === 'string' && uuid.test(id)),
      'INVALID_NOTIFICATION_RECEIPT_IDS',
    )
    const normalized = (value as string[]).map((id) => id.toLowerCase())
    requireReceipt(
      new Set(normalized).size === normalized.length,
      'DUPLICATE_NOTIFICATION_RECEIPT_IDS',
    )
    return normalized
  }
  const notificationIds = ids(input.notificationIds)
  const recipientIds = ids(input.recipientUserIds)
  requireReceipt(
    notificationIds.length === recipientIds.length,
    'NOTIFICATION_RECEIPT_COUNT_MISMATCH',
  )
  const revisions = await tx.query<{ id: string }>(
    `SELECT revision.id FROM match_report_revisions revision
    JOIN matches fixture ON fixture.id = revision.match_id AND fixture.organization_id = revision.organization_id
    WHERE revision.organization_id = $1::uuid AND revision.id = $2::uuid AND revision.match_id = $3::uuid
      AND fixture.tournament_id = $4::uuid AND revision.version = $5::integer AND revision.action = $6`,
    [
      organizationId,
      revisionId,
      String(input.matchId).toLowerCase(),
      String(input.tournamentId).toLowerCase(),
      input.reportVersion,
      input.action,
    ],
  )
  requireReceipt(revisions.length === 1, 'NOTIFICATION_RECEIPT_REVISION_MISMATCH')
  if (notificationIds.length === 0) return // A receipt proves existing records, not a fictitious recipient.
  const notifications = await tx.query<{ id: string; recipientId: string }>(
    `SELECT id, recipient_user_id AS "recipientId" FROM user_notifications
    WHERE organization_id = $1::uuid AND id = ANY($2::uuid[]) AND recipient_user_id = ANY($3::uuid[])
      AND metadata->>'matchId' = $4 AND metadata->>'revisionId' = $5
      AND metadata->>'reportVersion' = $6 AND metadata->>'action' = $7
      AND deduplication_key = 'match-report:' || $5 || ':' || recipient_user_id::text
      AND type = CASE WHEN $7 = 'SUBMIT' THEN 'MATCH_REPORT_SUBMITTED'::notification_type ELSE 'MATCH_REPORT_REVIEWED'::notification_type END`,
    [
      organizationId,
      notificationIds,
      recipientIds,
      String(input.matchId).toLowerCase(),
      revisionId,
      String(input.reportVersion),
      input.action,
    ],
  )
  requireReceipt(
    notifications.length === notificationIds.length &&
      new Set(notifications.map((row) => row.recipientId)).size === recipientIds.length,
    'NOTIFICATION_RECEIPT_RECORD_MISMATCH',
  )
  // No notification INSERT/UPDATE. OutboxStore commits the receipt with SUCCEEDED on this same tx.
}
