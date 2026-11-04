CREATE TYPE "tournament_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TYPE "competition_rule_version_status" AS ENUM ('PUBLISHED', 'RETIRED');

CREATE TYPE "stage_type" AS ENUM ('GROUP', 'KNOCKOUT');

CREATE TYPE "schedule_plan_status" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

CREATE TYPE "schedule_revision_status" AS ENUM ('PUBLISHED');

CREATE TYPE "match_status" AS ENUM ('DRAFT', 'SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED', 'CANCELLED');

CREATE TABLE "seasons" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "season_code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "starts_on" DATE,
  "ends_on" DATE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tournaments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "season_id" UUID NOT NULL,
  "tournament_code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "status" "tournament_status" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "competition_rule_versions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "tournament_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "status" "competition_rule_version_status" NOT NULL DEFAULT 'PUBLISHED',
  "rules" JSONB NOT NULL,
  "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "competition_rule_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tournament_stages" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "tournament_id" UUID NOT NULL,
  "stage_code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "type" "stage_type" NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tournament_stages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tournament_groups" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "stage_id" UUID NOT NULL,
  "group_code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tournament_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "competition_rounds" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "stage_id" UUID NOT NULL,
  "round_number" INTEGER NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "competition_rounds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "teams" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "team_code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "short_name" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "player_profiles" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "source_type" VARCHAR(64),
  "source_key" VARCHAR(120),
  "display_name" VARCHAR(120) NOT NULL,
  "jersey_name" VARCHAR(120),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "player_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venues" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "venue_code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "address" VARCHAR(240),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "schedule_plans" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "tournament_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "status" "schedule_plan_status" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(3),
  CONSTRAINT "schedule_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "schedule_revisions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "tournament_id" UUID NOT NULL,
  "schedule_plan_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "schedule_revision_status" NOT NULL DEFAULT 'PUBLISHED',
  "snapshot" JSONB NOT NULL,
  "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "schedule_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "matches" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "tournament_id" UUID NOT NULL,
  "schedule_plan_id" UUID,
  "schedule_revision_id" UUID,
  "stage_id" UUID,
  "group_id" UUID,
  "round_id" UUID,
  "home_team_id" UUID,
  "away_team_id" UUID,
  "venue_id" UUID,
  "match_code" VARCHAR(64) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "status" "match_status" NOT NULL DEFAULT 'DRAFT',
  "scheduled_start_at" TIMESTAMPTZ(3),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "seasons_organization_id_season_code_key" ON "seasons"("organization_id", "season_code");
CREATE INDEX "seasons_organization_id_created_at_idx" ON "seasons"("organization_id", "created_at");
CREATE UNIQUE INDEX "tournaments_organization_id_tournament_code_key" ON "tournaments"("organization_id", "tournament_code");
CREATE INDEX "tournaments_organization_id_status_created_at_idx" ON "tournaments"("organization_id", "status", "created_at");
CREATE INDEX "tournaments_season_id_idx" ON "tournaments"("season_id");
CREATE UNIQUE INDEX "competition_rule_versions_tournament_id_version_key" ON "competition_rule_versions"("tournament_id", "version");
CREATE INDEX "competition_rule_versions_organization_id_tournament_id_idx" ON "competition_rule_versions"("organization_id", "tournament_id");
CREATE UNIQUE INDEX "tournament_stages_tournament_id_stage_code_key" ON "tournament_stages"("tournament_id", "stage_code");
CREATE INDEX "tournament_stages_organization_id_tournament_id_sort_order_idx" ON "tournament_stages"("organization_id", "tournament_id", "sort_order");
CREATE UNIQUE INDEX "tournament_groups_stage_id_group_code_key" ON "tournament_groups"("stage_id", "group_code");
CREATE INDEX "tournament_groups_organization_id_stage_id_sort_order_idx" ON "tournament_groups"("organization_id", "stage_id", "sort_order");
CREATE UNIQUE INDEX "competition_rounds_stage_id_round_number_key" ON "competition_rounds"("stage_id", "round_number");
CREATE INDEX "competition_rounds_organization_id_stage_id_round_number_idx" ON "competition_rounds"("organization_id", "stage_id", "round_number");
CREATE UNIQUE INDEX "teams_organization_id_team_code_key" ON "teams"("organization_id", "team_code");
CREATE INDEX "teams_organization_id_name_idx" ON "teams"("organization_id", "name");
CREATE INDEX "player_profiles_organization_id_display_name_idx" ON "player_profiles"("organization_id", "display_name");
CREATE UNIQUE INDEX "player_profiles_organization_id_source_type_source_key_key" ON "player_profiles"("organization_id", "source_type", "source_key") WHERE "source_key" IS NOT NULL;
CREATE UNIQUE INDEX "venues_organization_id_venue_code_key" ON "venues"("organization_id", "venue_code");
CREATE INDEX "venues_organization_id_name_idx" ON "venues"("organization_id", "name");
CREATE INDEX "schedule_plans_organization_id_tournament_id_status_idx" ON "schedule_plans"("organization_id", "tournament_id", "status");
CREATE UNIQUE INDEX "schedule_revisions_schedule_plan_id_version_key" ON "schedule_revisions"("schedule_plan_id", "version");
CREATE INDEX "schedule_revisions_org_tournament_published_at_idx" ON "schedule_revisions"("organization_id", "tournament_id", "published_at");
CREATE UNIQUE INDEX "matches_organization_id_match_code_key" ON "matches"("organization_id", "match_code");
CREATE INDEX "matches_organization_id_scheduled_start_at_idx" ON "matches"("organization_id", "scheduled_start_at");
CREATE INDEX "matches_tournament_id_status_scheduled_start_at_idx" ON "matches"("tournament_id", "status", "scheduled_start_at");
CREATE INDEX "matches_stage_id_round_id_idx" ON "matches"("stage_id", "round_id");
CREATE INDEX "matches_schedule_revision_id_scheduled_start_at_idx" ON "matches"("schedule_revision_id", "scheduled_start_at");

ALTER TABLE "seasons" ADD CONSTRAINT "seasons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "competition_rule_versions" ADD CONSTRAINT "competition_rule_versions_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tournament_stages" ADD CONSTRAINT "tournament_stages_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tournament_groups" ADD CONSTRAINT "tournament_groups_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "tournament_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "competition_rounds" ADD CONSTRAINT "competition_rounds_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "tournament_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venues" ADD CONSTRAINT "venues_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "schedule_plans" ADD CONSTRAINT "schedule_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "schedule_plans" ADD CONSTRAINT "schedule_plans_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "schedule_revisions" ADD CONSTRAINT "schedule_revisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "schedule_revisions" ADD CONSTRAINT "schedule_revisions_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "schedule_revisions" ADD CONSTRAINT "schedule_revisions_schedule_plan_id_fkey" FOREIGN KEY ("schedule_plan_id") REFERENCES "schedule_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_schedule_plan_id_fkey" FOREIGN KEY ("schedule_plan_id") REFERENCES "schedule_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_schedule_revision_id_fkey" FOREIGN KEY ("schedule_revision_id") REFERENCES "schedule_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "tournament_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "tournament_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "competition_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
