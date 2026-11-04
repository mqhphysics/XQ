import { type Prisma } from '../generated/prisma/client'

import { type ConfirmedResultRow } from './confirmed-result'

export type ResultsTransaction = Prisma.TransactionClient
export interface ResultFixtureRow extends ConfirmedResultRow {
  status: string
  reportVersion: number
}
export interface ParticipantRow {
  teamId: string
  groupId: string | null
}
export interface GroupRow {
  id: string
  stageId: string
}

export async function loadResultFixtures(
  tx: ResultsTransaction,
  organizationId: string,
  tournamentId: string,
  lock = false,
  sourceStageId: string | null = null,
  targetIds: string[] = [],
): Promise<ResultFixtureRow[]> {
  return tx.$queryRawUnsafe<ResultFixtureRow[]>(
    `SELECT fixture.id, fixture.organization_id AS "organizationId", fixture.tournament_id AS "tournamentId",
    fixture.stage_id AS "stageId", fixture.group_id AS "groupId", fixture.round_id AS "roundId", fixture.scheduled_start_at AS "scheduledStartAt", fixture.home_team_id AS "homeTeamId", fixture.away_team_id AS "awayTeamId",
    fixture.status::text AS status, fixture.report_version AS "reportVersion", fixture.confirmed_report_version AS "confirmedReportVersion",
    revision.id AS "reportRevisionId", revision.rule_version_id AS "ruleVersionId",
    CASE WHEN revision.id IS NULL THEN NULL ELSE jsonb_build_object('outcome', revision.fields->'outcome', 'homeScore', revision.fields->'homeScore', 'awayScore', revision.fields->'awayScore', 'homePenaltyScore', revision.fields->'homePenaltyScore', 'awayPenaltyScore', revision.fields->'awayPenaltyScore', '_matchContext', revision.fields->'_matchContext', '_liveReport', revision.fields->'_liveReport') END AS fields,
    coalesce(fixture.scheduled_start_at, revision.created_at, fixture.created_at) AS "playedAt",
    projection.source_report_version AS "projectionSourceVersion", projection.report_revision_id AS "projectionRevisionId", NULL::jsonb AS "projectionPayload"
    FROM matches fixture
    LEFT JOIN match_report_revisions revision ON revision.organization_id = fixture.organization_id AND revision.match_id = fixture.id AND revision.version = fixture.confirmed_report_version AND revision.status = 'CONFIRMED'
    LEFT JOIN match_result_projections projection ON projection.organization_id = fixture.organization_id AND projection.match_id = fixture.id
    WHERE fixture.organization_id = $1::uuid AND fixture.tournament_id = $2::uuid
      AND ($3::uuid IS NULL OR fixture.stage_id = $3::uuid OR fixture.id = ANY($4::uuid[]))
    ORDER BY fixture.id ${lock ? 'FOR UPDATE OF fixture' : ''}`,
    organizationId,
    tournamentId,
    sourceStageId,
    targetIds,
  )
}

export async function loadParticipants(
  tx: ResultsTransaction,
  organizationId: string,
  tournamentId: string,
): Promise<ParticipantRow[]> {
  return tx.$queryRawUnsafe<ParticipantRow[]>(
    `SELECT team_id AS "teamId", group_id AS "groupId" FROM team_registrations
    WHERE organization_id = $1::uuid AND tournament_id = $2::uuid AND status = 'APPROVED' ORDER BY team_id`,
    organizationId,
    tournamentId,
  )
}

export async function loadGroups(
  tx: ResultsTransaction,
  organizationId: string,
  tournamentId: string,
): Promise<GroupRow[]> {
  return tx.$queryRawUnsafe<GroupRow[]>(
    `SELECT fixture_group.id, fixture_group.stage_id AS "stageId" FROM tournament_groups fixture_group
    JOIN tournament_stages stage ON stage.id = fixture_group.stage_id AND stage.organization_id = fixture_group.organization_id
    WHERE fixture_group.organization_id = $1::uuid AND stage.tournament_id = $2::uuid ORDER BY fixture_group.id`,
    organizationId,
    tournamentId,
  )
}
