-- CreateEnum
CREATE TYPE "match_report_status" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "lineup_plan_kind" AS ENUM ('TACTIC', 'MATCH_LINEUP');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notification_type" ADD VALUE 'ROSTER_SUBMITTED';
ALTER TYPE "notification_type" ADD VALUE 'ROSTER_UPDATED';
ALTER TYPE "notification_type" ADD VALUE 'MATCH_REPORT_SUBMITTED';
ALTER TYPE "notification_type" ADD VALUE 'MATCH_REPORT_REVIEWED';

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "progression_version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "confirmed_report_version" INTEGER,
ADD COLUMN     "report_version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "match_report_revisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "match_report_status" NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "fields" JSONB NOT NULL,
    "home_roster_snapshot_id" UUID NOT NULL,
    "away_roster_snapshot_id" UUID NOT NULL,
    "rule_version_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_report_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_lineup_plans" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "kind" "lineup_plan_kind" NOT NULL DEFAULT 'TACTIC',
    "tournament_id" UUID,
    "match_id" UUID,
    "roster_snapshot_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_lineup_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_lineup_revisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "roster_snapshot_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_lineup_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_result_projections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "source_report_version" INTEGER NOT NULL,
    "report_revision_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_result_projections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_progressions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tournament_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "source_hash" CHAR(64) NOT NULL,
    "source_versions" JSONB NOT NULL,
    "slots" JSONB NOT NULL,
    "rule_version_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_progressions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_report_revisions_org_match_status_version_idx" ON "match_report_revisions"("organization_id", "match_id", "status", "version");

-- CreateIndex
CREATE UNIQUE INDEX "match_report_revisions_match_version_key" ON "match_report_revisions"("match_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "match_report_revisions_id_org_key" ON "match_report_revisions"("id", "organization_id");

-- CreateIndex
CREATE INDEX "team_lineup_plans_org_team_match_idx" ON "team_lineup_plans"("organization_id", "team_id", "match_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_lineup_plans_org_team_name_key" ON "team_lineup_plans"("organization_id", "team_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "team_lineup_plans_id_org_key" ON "team_lineup_plans"("id", "organization_id");

-- CreateIndex
CREATE INDEX "team_lineup_revisions_org_plan_version_idx" ON "team_lineup_revisions"("organization_id", "plan_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "team_lineup_revisions_plan_version_key" ON "team_lineup_revisions"("plan_id", "version");

-- CreateIndex
CREATE INDEX "match_result_projections_org_version_idx" ON "match_result_projections"("organization_id", "source_report_version");

-- CreateIndex
CREATE UNIQUE INDEX "match_result_projections_org_match_key" ON "match_result_projections"("organization_id", "match_id");

-- CreateIndex
CREATE INDEX "tournament_progressions_org_tournament_hash_idx" ON "tournament_progressions"("organization_id", "tournament_id", "source_hash");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_progressions_tournament_version_key" ON "tournament_progressions"("tournament_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "competition_rule_version_id_organization_id_key" ON "competition_rule_versions"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_id_organization_id_key" ON "matches"("id", "organization_id");

-- AddForeignKey
ALTER TABLE "match_report_revisions" ADD CONSTRAINT "match_report_revisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_report_revisions" ADD CONSTRAINT "match_report_revisions_match_id_organization_id_fkey" FOREIGN KEY ("match_id", "organization_id") REFERENCES "matches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_report_revisions" ADD CONSTRAINT "match_report_revisions_home_roster_snapshot_id_organizatio_fkey" FOREIGN KEY ("home_roster_snapshot_id", "organization_id") REFERENCES "roster_snapshots"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_report_revisions" ADD CONSTRAINT "match_report_revisions_away_roster_snapshot_id_organizatio_fkey" FOREIGN KEY ("away_roster_snapshot_id", "organization_id") REFERENCES "roster_snapshots"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_report_revisions" ADD CONSTRAINT "match_report_revisions_rule_version_id_organization_id_fkey" FOREIGN KEY ("rule_version_id", "organization_id") REFERENCES "competition_rule_versions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_report_revisions" ADD CONSTRAINT "match_report_revisions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_lineup_plans" ADD CONSTRAINT "team_lineup_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_lineup_plans" ADD CONSTRAINT "team_lineup_plans_team_id_organization_id_fkey" FOREIGN KEY ("team_id", "organization_id") REFERENCES "teams"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_lineup_plans" ADD CONSTRAINT "team_lineup_plans_tournament_id_organization_id_fkey" FOREIGN KEY ("tournament_id", "organization_id") REFERENCES "tournaments"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_lineup_plans" ADD CONSTRAINT "team_lineup_plans_match_id_organization_id_fkey" FOREIGN KEY ("match_id", "organization_id") REFERENCES "matches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_lineup_plans" ADD CONSTRAINT "team_lineup_plans_roster_snapshot_id_organization_id_fkey" FOREIGN KEY ("roster_snapshot_id", "organization_id") REFERENCES "roster_snapshots"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_lineup_revisions" ADD CONSTRAINT "team_lineup_revisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_lineup_revisions" ADD CONSTRAINT "team_lineup_revisions_plan_id_organization_id_fkey" FOREIGN KEY ("plan_id", "organization_id") REFERENCES "team_lineup_plans"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_lineup_revisions" ADD CONSTRAINT "team_lineup_revisions_roster_snapshot_id_organization_id_fkey" FOREIGN KEY ("roster_snapshot_id", "organization_id") REFERENCES "roster_snapshots"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_lineup_revisions" ADD CONSTRAINT "team_lineup_revisions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_result_projections" ADD CONSTRAINT "match_result_projections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_result_projections" ADD CONSTRAINT "match_result_projections_match_id_organization_id_fkey" FOREIGN KEY ("match_id", "organization_id") REFERENCES "matches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_result_projections" ADD CONSTRAINT "match_result_projections_report_revision_id_organization_i_fkey" FOREIGN KEY ("report_revision_id", "organization_id") REFERENCES "match_report_revisions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_progressions" ADD CONSTRAINT "tournament_progressions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_progressions" ADD CONSTRAINT "tournament_progressions_tournament_id_organization_id_fkey" FOREIGN KEY ("tournament_id", "organization_id") REFERENCES "tournaments"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_progressions" ADD CONSTRAINT "tournament_progressions_rule_version_id_organization_id_fkey" FOREIGN KEY ("rule_version_id", "organization_id") REFERENCES "competition_rule_versions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_progressions" ADD CONSTRAINT "tournament_progressions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The three histories are append-only. Revisions are never edited in place.
CREATE FUNCTION v2_reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'V2 history is append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER match_report_revisions_immutable BEFORE UPDATE OR DELETE ON match_report_revisions FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
CREATE TRIGGER team_lineup_revisions_immutable BEFORE UPDATE OR DELETE ON team_lineup_revisions FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
CREATE TRIGGER tournament_progressions_immutable BEFORE UPDATE OR DELETE ON tournament_progressions FOR EACH ROW EXECUTE FUNCTION v2_reject_history_mutation();
ALTER TABLE matches ADD CONSTRAINT matches_v2_report_versions_check CHECK (report_version >= 0 AND (confirmed_report_version IS NULL OR (confirmed_report_version > 0 AND confirmed_report_version <= report_version)));
ALTER TABLE tournaments ADD CONSTRAINT tournaments_progression_version_check CHECK (progression_version >= 0);
ALTER TABLE match_report_revisions ADD CONSTRAINT match_report_revision_shape_check CHECK (version > 0 AND action IN ('SAVE','SUBMIT','RETURN','CONFIRM','CORRECT') AND jsonb_typeof(fields) = 'object');
ALTER TABLE team_lineup_plans ADD CONSTRAINT team_lineup_plan_shape_check CHECK (version >= 0 AND jsonb_typeof(payload) = 'object' AND (kind <> 'MATCH_LINEUP' OR (match_id IS NOT NULL AND tournament_id IS NOT NULL AND roster_snapshot_id IS NOT NULL)));
ALTER TABLE team_lineup_revisions ADD CONSTRAINT team_lineup_revision_shape_check CHECK (version > 0 AND jsonb_typeof(payload) = 'object');
ALTER TABLE match_result_projections ADD CONSTRAINT match_result_projection_shape_check CHECK (source_report_version > 0 AND jsonb_typeof(payload) = 'object');
ALTER TABLE tournament_progressions ADD CONSTRAINT tournament_progression_shape_check CHECK (version > 0 AND jsonb_typeof(source_versions) = 'object' AND jsonb_typeof(slots) = 'array');
