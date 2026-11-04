import { randomUUID } from 'node:crypto'

import { PermanentJobError, type SqlExecutor } from '../outbox/outbox-store'
import {
  type ConfirmationHead,
  type ConfirmedRevision,
  type ResultProjectionRepository,
} from './match-report-handler'

export type ProjectionPayloadBuilder = (revision: ConfirmedRevision) => Record<string, unknown>

// Implements the integrator's RESULTS-CONTRACT-01 table mappings.
// The payload builder is explicit so raw restricted report notes cannot leak by default.
export class PostgresResultProjectionRepository implements ResultProjectionRepository {
  constructor(private readonly buildPayload: ProjectionPayloadBuilder) {}

  async lockConfirmationHead(
    tx: SqlExecutor,
    organizationId: string,
    matchId: string,
  ): Promise<ConfirmationHead | null> {
    const rows = await tx.query<ConfirmationHead>(
      `SELECT organization_id AS "organizationId", id AS "matchId", tournament_id AS "tournamentId",
      confirmed_report_version AS "confirmedReportVersion"
      FROM matches WHERE organization_id = $1::uuid AND id = $2::uuid FOR UPDATE`,
      [organizationId, matchId],
    )
    return rows[0] ?? null
  }

  async getConfirmedRevision(
    tx: SqlExecutor,
    organizationId: string,
    matchId: string,
    version: number,
  ): Promise<ConfirmedRevision | null> {
    const rows = await tx.query<ConfirmedRevision>(
      `SELECT revision.organization_id AS "organizationId", revision.match_id AS "matchId",
      fixture.tournament_id AS "tournamentId", revision.version, revision.id AS "revisionId",
      revision.rule_version_id AS "ruleVersionId", revision.status::text AS status, revision.fields,
      fixture.stage_id AS "stageId", fixture.group_id AS "groupId", fixture.round_id AS "roundId", fixture.scheduled_start_at AS "scheduledStartAt",
      fixture.home_team_id AS "homeTeamId", fixture.away_team_id AS "awayTeamId",
      coalesce(fixture.scheduled_start_at, revision.created_at) AS "playedAt", rule.rules->'results' AS "resultRules"
      FROM match_report_revisions revision
      JOIN matches fixture ON fixture.id = revision.match_id AND fixture.organization_id = revision.organization_id
      JOIN competition_rule_versions rule ON rule.id = revision.rule_version_id
        AND rule.organization_id = revision.organization_id AND rule.tournament_id = fixture.tournament_id
      JOIN roster_snapshots home_roster ON home_roster.id = revision.home_roster_snapshot_id
        AND home_roster.organization_id = revision.organization_id AND home_roster.tournament_id = fixture.tournament_id
        AND home_roster.team_id = fixture.home_team_id AND home_roster.locked_at IS NOT NULL
      JOIN roster_snapshots away_roster ON away_roster.id = revision.away_roster_snapshot_id
        AND away_roster.organization_id = revision.organization_id AND away_roster.tournament_id = fixture.tournament_id
        AND away_roster.team_id = fixture.away_team_id AND away_roster.locked_at IS NOT NULL
      WHERE revision.organization_id = $1::uuid AND revision.match_id = $2::uuid AND revision.version = $3 AND revision.status = 'CONFIRMED'`,
      [organizationId, matchId, version],
    )
    return rows[0] ?? null
  }

  async writeProjection(tx: SqlExecutor, revision: ConfirmedRevision): Promise<void> {
    let payload: string
    try {
      const data = this.buildPayload(revision)
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new Error('INVALID_PAYLOAD')
      const serialized = JSON.stringify(data)
      if (typeof serialized !== 'string') throw new Error('INVALID_PAYLOAD')
      payload = serialized
    } catch (error) {
      if (error instanceof PermanentJobError) throw error
      throw new PermanentJobError('RESULT_PROJECTION_PAYLOAD_INVALID')
    }
    // Business revision fencing applies even if this method is called without the handler.
    // The locked Match row also serializes confirmations and projection writes.
    await tx.query(
      `WITH confirmed_head AS (
        SELECT fixture.id FROM matches fixture
        JOIN match_report_revisions source ON source.match_id = fixture.id
          AND source.organization_id = fixture.organization_id
        WHERE fixture.organization_id = $2::uuid AND fixture.id = $3::uuid
          AND fixture.confirmed_report_version = $4::integer
          AND source.id = $5::uuid AND source.version = $4::integer AND source.status = 'CONFIRMED'
          AND source.rule_version_id = $7::uuid
        FOR UPDATE OF fixture
      )
      INSERT INTO match_result_projections
      (id, organization_id, match_id, source_report_version, report_revision_id, payload, updated_at)
      SELECT $1::uuid, $2::uuid, $3::uuid, $4::integer, $5::uuid, $6::jsonb, clock_timestamp()
      FROM confirmed_head
      ON CONFLICT (organization_id, match_id) DO UPDATE SET
        source_report_version = EXCLUDED.source_report_version,
        report_revision_id = EXCLUDED.report_revision_id,
        payload = EXCLUDED.payload, updated_at = clock_timestamp()
      WHERE match_result_projections.source_report_version < EXCLUDED.source_report_version
      RETURNING id`,
      [
        randomUUID(),
        revision.organizationId,
        revision.matchId,
        revision.version,
        revision.revisionId,
        payload,
        revision.ruleVersionId,
      ],
    )
  }
}
