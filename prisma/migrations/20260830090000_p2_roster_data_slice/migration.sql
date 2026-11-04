CREATE TYPE "team_registration_status" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'RETURNED',
  'WITHDRAWN',
  'SUSPENDED'
);

CREATE TYPE "roster_submission_status" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'RETURNED',
  'APPROVED',
  'LOCKED',
  'REOPENED',
  'WITHDRAWN'
);

CREATE TYPE "data_quality_status" AS ENUM ('CLEAN', 'WARNING', 'ERROR');

CREATE TYPE "import_batch_status" AS ENUM (
  'UPLOADED',
  'VALIDATING',
  'READY',
  'IMPORTING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED'
);

ALTER TABLE "player_profiles"
  ADD COLUMN "student_id_masked" VARCHAR(64);

CREATE UNIQUE INDEX "tournaments_id_organization_id_key"
  ON "tournaments"("id", "organization_id");
CREATE UNIQUE INDEX "teams_id_organization_id_key"
  ON "teams"("id", "organization_id");
CREATE UNIQUE INDEX "player_profiles_id_organization_id_key"
  ON "player_profiles"("id", "organization_id");

CREATE TABLE "team_registrations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "tournament_id" UUID NOT NULL,
  "team_id" UUID NOT NULL,
  "status" "team_registration_status" NOT NULL DEFAULT 'DRAFT',
  "leader_display_name" VARCHAR(120),
  "coach_display_name" VARCHAR(120),
  "contact_name" VARCHAR(120),
  "contact_phone" VARCHAR(40),
  "approved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_registrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roster_submissions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "team_registration_id" UUID NOT NULL,
  "submission_version" INTEGER NOT NULL,
  "status" "roster_submission_status" NOT NULL DEFAULT 'DRAFT',
  "data_quality_status" "data_quality_status" NOT NULL DEFAULT 'CLEAN',
  "warning_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "source_file_hash" CHAR(64) NOT NULL,
  "submitted_at" TIMESTAMPTZ(3),
  "approved_at" TIMESTAMPTZ(3),
  "locked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roster_submissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roster_submissions_submission_version_check" CHECK ("submission_version" > 0)
);

CREATE TABLE "roster_entries" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "roster_submission_id" UUID NOT NULL,
  "player_profile_id" UUID NOT NULL,
  "shirt_number" VARCHAR(16),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roster_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roster_entries_sort_order_check" CHECK ("sort_order" >= 0)
);

CREATE TABLE "roster_snapshots" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "tournament_id" UUID NOT NULL,
  "team_id" UUID NOT NULL,
  "team_registration_id" UUID NOT NULL,
  "roster_submission_id" UUID NOT NULL,
  "snapshot_version" INTEGER NOT NULL,
  "source_file_hash" CHAR(64) NOT NULL,
  "locked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roster_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roster_snapshots_snapshot_version_check" CHECK ("snapshot_version" > 0)
);

CREATE TABLE "roster_snapshot_entries" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "roster_snapshot_id" UUID NOT NULL,
  "player_profile_id" UUID NOT NULL,
  "display_name" VARCHAR(120) NOT NULL,
  "shirt_number" VARCHAR(16),
  "student_id_masked" VARCHAR(64),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roster_snapshot_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roster_snapshot_entries_sort_order_check" CHECK ("sort_order" >= 0)
);

CREATE TABLE "import_batches" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "tournament_id" UUID NOT NULL,
  "team_registration_id" UUID,
  "roster_snapshot_id" UUID,
  "import_type" VARCHAR(64) NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "source_file_hash" CHAR(64) NOT NULL,
  "status" "import_batch_status" NOT NULL DEFAULT 'UPLOADED',
  "team_code" VARCHAR(64) NOT NULL,
  "row_count" INTEGER NOT NULL,
  "warning_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "confirmed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "import_batches_schema_version_check" CHECK ("schema_version" > 0),
  CONSTRAINT "import_batches_row_count_check" CHECK ("row_count" >= 0)
);

CREATE UNIQUE INDEX "team_registrations_tournament_id_team_id_key"
  ON "team_registrations"("tournament_id", "team_id");
CREATE UNIQUE INDEX "team_registrations_id_organization_id_key"
  ON "team_registrations"("id", "organization_id");
CREATE INDEX "team_registrations_org_tournament_status_idx"
  ON "team_registrations"("organization_id", "tournament_id", "status");
CREATE INDEX "team_registrations_organization_id_team_id_idx"
  ON "team_registrations"("organization_id", "team_id");

CREATE UNIQUE INDEX "roster_submissions_registration_id_version_key"
  ON "roster_submissions"("team_registration_id", "submission_version");
CREATE UNIQUE INDEX "roster_submissions_registration_id_source_hash_key"
  ON "roster_submissions"("team_registration_id", "source_file_hash");
CREATE UNIQUE INDEX "roster_submissions_id_organization_id_key"
  ON "roster_submissions"("id", "organization_id");
CREATE INDEX "roster_submissions_organization_id_status_created_at_idx"
  ON "roster_submissions"("organization_id", "status", "created_at");
CREATE INDEX "roster_submissions_registration_id_status_idx"
  ON "roster_submissions"("team_registration_id", "status");

CREATE UNIQUE INDEX "roster_entries_submission_id_player_profile_id_key"
  ON "roster_entries"("roster_submission_id", "player_profile_id");
CREATE INDEX "roster_entries_org_player_submission_idx"
  ON "roster_entries"("organization_id", "player_profile_id", "roster_submission_id");

CREATE UNIQUE INDEX "roster_snapshots_roster_submission_id_key"
  ON "roster_snapshots"("roster_submission_id");
CREATE UNIQUE INDEX "roster_snapshots_tournament_id_team_id_version_key"
  ON "roster_snapshots"("tournament_id", "team_id", "snapshot_version");
CREATE UNIQUE INDEX "roster_snapshots_submission_id_organization_id_key"
  ON "roster_snapshots"("roster_submission_id", "organization_id");
CREATE UNIQUE INDEX "roster_snapshots_id_organization_id_key"
  ON "roster_snapshots"("id", "organization_id");
CREATE INDEX "roster_snapshots_org_tournament_team_locked_at_idx"
  ON "roster_snapshots"("organization_id", "tournament_id", "team_id", "locked_at");
CREATE INDEX "roster_snapshots_registration_id_version_idx"
  ON "roster_snapshots"("team_registration_id", "snapshot_version");

CREATE UNIQUE INDEX "roster_snapshot_entries_snapshot_id_player_id_key"
  ON "roster_snapshot_entries"("roster_snapshot_id", "player_profile_id");
CREATE INDEX "roster_snapshot_entries_org_snapshot_sort_idx"
  ON "roster_snapshot_entries"("organization_id", "roster_snapshot_id", "sort_order");

CREATE UNIQUE INDEX "import_batches_org_tournament_type_source_hash_key"
  ON "import_batches"("organization_id", "tournament_id", "import_type", "source_file_hash");
CREATE INDEX "import_batches_org_tournament_created_at_idx"
  ON "import_batches"("organization_id", "tournament_id", "created_at");
CREATE INDEX "import_batches_registration_id_created_at_idx"
  ON "import_batches"("team_registration_id", "created_at");

ALTER TABLE "team_registrations"
  ADD CONSTRAINT "team_registrations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_registrations"
  ADD CONSTRAINT "team_registrations_tournament_organization_fkey"
  FOREIGN KEY ("tournament_id", "organization_id") REFERENCES "tournaments"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_registrations"
  ADD CONSTRAINT "team_registrations_team_organization_fkey"
  FOREIGN KEY ("team_id", "organization_id") REFERENCES "teams"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roster_submissions"
  ADD CONSTRAINT "roster_submissions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roster_submissions"
  ADD CONSTRAINT "roster_submissions_registration_organization_fkey"
  FOREIGN KEY ("team_registration_id", "organization_id") REFERENCES "team_registrations"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roster_entries"
  ADD CONSTRAINT "roster_entries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roster_entries"
  ADD CONSTRAINT "roster_entries_submission_organization_fkey"
  FOREIGN KEY ("roster_submission_id", "organization_id") REFERENCES "roster_submissions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roster_entries"
  ADD CONSTRAINT "roster_entries_player_organization_fkey"
  FOREIGN KEY ("player_profile_id", "organization_id") REFERENCES "player_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roster_snapshots"
  ADD CONSTRAINT "roster_snapshots_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roster_snapshots"
  ADD CONSTRAINT "roster_snapshots_tournament_organization_fkey"
  FOREIGN KEY ("tournament_id", "organization_id") REFERENCES "tournaments"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roster_snapshots"
  ADD CONSTRAINT "roster_snapshots_team_organization_fkey"
  FOREIGN KEY ("team_id", "organization_id") REFERENCES "teams"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roster_snapshots"
  ADD CONSTRAINT "roster_snapshots_registration_organization_fkey"
  FOREIGN KEY ("team_registration_id", "organization_id") REFERENCES "team_registrations"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roster_snapshots"
  ADD CONSTRAINT "roster_snapshots_submission_organization_fkey"
  FOREIGN KEY ("roster_submission_id", "organization_id") REFERENCES "roster_submissions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roster_snapshot_entries"
  ADD CONSTRAINT "roster_snapshot_entries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roster_snapshot_entries"
  ADD CONSTRAINT "roster_snapshot_entries_snapshot_organization_fkey"
  FOREIGN KEY ("roster_snapshot_id", "organization_id") REFERENCES "roster_snapshots"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roster_snapshot_entries"
  ADD CONSTRAINT "roster_snapshot_entries_player_organization_fkey"
  FOREIGN KEY ("player_profile_id", "organization_id") REFERENCES "player_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "import_batches"
  ADD CONSTRAINT "import_batches_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_batches"
  ADD CONSTRAINT "import_batches_tournament_organization_fkey"
  FOREIGN KEY ("tournament_id", "organization_id") REFERENCES "tournaments"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_batches"
  ADD CONSTRAINT "import_batches_registration_organization_fkey"
  FOREIGN KEY ("team_registration_id", "organization_id") REFERENCES "team_registrations"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_batches"
  ADD CONSTRAINT "import_batches_snapshot_organization_fkey"
  FOREIGN KEY ("roster_snapshot_id", "organization_id") REFERENCES "roster_snapshots"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "guard_roster_snapshot_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."locked_at" IS NOT NULL THEN
      RAISE EXCEPTION 'locked roster snapshots are immutable' USING ERRCODE = '55000';
    END IF;

    RETURN OLD;
  END IF;

  IF OLD."locked_at" IS NOT NULL
    OR NEW."locked_at" IS NULL
    OR (to_jsonb(NEW) - 'locked_at') IS DISTINCT FROM (to_jsonb(OLD) - 'locked_at') THEN
    RAISE EXCEPTION 'locked roster snapshots are immutable' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "roster_snapshots_immutable"
  BEFORE UPDATE OR DELETE ON "roster_snapshots"
  FOR EACH ROW EXECUTE FUNCTION "guard_roster_snapshot_mutation"();

CREATE FUNCTION "guard_roster_snapshot_entry_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (
      SELECT 1 FROM "roster_snapshots"
      WHERE "id" = NEW."roster_snapshot_id" AND "locked_at" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'locked roster snapshot entries are immutable' USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF EXISTS (
      SELECT 1 FROM "roster_snapshots"
      WHERE "id" IN (OLD."roster_snapshot_id", NEW."roster_snapshot_id")
        AND "locked_at" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'locked roster snapshot entries are immutable' USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "roster_snapshots"
    WHERE "id" = OLD."roster_snapshot_id" AND "locked_at" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'locked roster snapshot entries are immutable' USING ERRCODE = '55000';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "roster_snapshot_entries_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "roster_snapshot_entries"
  FOR EACH ROW EXECUTE FUNCTION "guard_roster_snapshot_entry_mutation"();
