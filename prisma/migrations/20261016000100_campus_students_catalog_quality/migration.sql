-- AlterTable
ALTER TABLE "app_users" ADD COLUMN     "cover_url" VARCHAR(512),
ADD COLUMN     "onboarding_completed_at" TIMESTAMPTZ(3),
ADD COLUMN     "player_offer_dismissed_at" TIMESTAMPTZ(3),
ADD COLUMN     "profile_cohort" VARCHAR(64) NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "student_record_id" UUID,
ADD COLUMN     "student_verified_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "seasons" ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "competition_definition_id" UUID;

-- AlterTable
ALTER TABLE "player_profiles" ADD COLUMN     "cover_url" VARCHAR(512),
ADD COLUMN     "student_record_id" UUID;

-- AlterTable
ALTER TABLE "team_registrations" ADD COLUMN     "team_profile_snapshot" JSONB;

-- CreateTable
CREATE TABLE "student_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_number" VARCHAR(32),
    "real_name" VARCHAR(120) NOT NULL,
    "gender" VARCHAR(16) NOT NULL DEFAULT 'UNSPECIFIED',
    "college_name" VARCHAR(160) NOT NULL DEFAULT '',
    "academic_year" VARCHAR(32) NOT NULL DEFAULT '',
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "source_type" VARCHAR(64) NOT NULL DEFAULT 'MANUAL',
    "cohort" VARCHAR(64) NOT NULL DEFAULT 'CURRENT',
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_definitions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "cup_name" VARCHAR(80) NOT NULL,
    "gender" VARCHAR(16) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporter_profiles" (
    "probation_completed_at" TIMESTAMPTZ(3),
    "probation_started_at" TIMESTAMPTZ(3),
    "probation_until" TIMESTAMPTZ(3),
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 100,
    "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    "freeze_reason" VARCHAR(80),
    "consecutive_qualified" INTEGER NOT NULL DEFAULT 0,
    "reinstatement_count" INTEGER NOT NULL DEFAULT 0,
    "last_contribution_at" TIMESTAMPTZ(3),
    "activity_since" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cooldown_until" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reporter_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporter_score_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "deduplication_key" VARCHAR(160) NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "delta" INTEGER NOT NULL,
    "score_before" INTEGER NOT NULL,
    "score_after" INTEGER NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "actor_user_id" UUID,
    "case_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reporter_score_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporter_correction_cases" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "report_revision_id" UUID NOT NULL,
    "error_key" VARCHAR(120) NOT NULL,
    "reported_by_user_id" UUID NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
    "review_note" VARCHAR(2000),
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "appeal" VARCHAR(2000),
    "appealed_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reporter_correction_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporter_contributions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "report_revision_id" UUID NOT NULL,
    "qualified" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reporter_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporter_reinstatements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'SUBMITTED',
    "review_note" VARCHAR(2000),
    "reviewed_by_user_id" UUID,
    "cooldown_until" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reporter_reinstatements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_records_organization_id_cohort_status_idx" ON "student_records"("organization_id", "cohort", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_records_organization_id_student_number_key" ON "student_records"("organization_id", "student_number");

-- CreateIndex
CREATE INDEX "competition_definitions_organization_id_sort_order_idx" ON "competition_definitions"("organization_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "competition_definitions_organization_id_code_key" ON "competition_definitions"("organization_id", "code");

-- CreateIndex
CREATE INDEX "reporter_profiles_organization_id_status_idx" ON "reporter_profiles"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reporter_profiles_organization_id_user_id_key" ON "reporter_profiles"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "reporter_score_entries_profile_id_created_at_idx" ON "reporter_score_entries"("profile_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reporter_score_entries_organization_id_deduplication_key_key" ON "reporter_score_entries"("organization_id", "deduplication_key");

-- CreateIndex
CREATE INDEX "reporter_correction_cases_organization_id_status_created_at_idx" ON "reporter_correction_cases"("organization_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reporter_correction_cases_organization_id_report_revision_i_key" ON "reporter_correction_cases"("organization_id", "report_revision_id", "error_key");

-- CreateIndex
CREATE UNIQUE INDEX "reporter_contributions_profile_id_match_id_key" ON "reporter_contributions"("profile_id", "match_id");

-- CreateIndex
CREATE INDEX "reporter_reinstatements_organization_id_status_idx" ON "reporter_reinstatements"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "app_users_student_record_id_key" ON "app_users"("student_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournaments_competition_season_key" ON "tournaments"("competition_definition_id", "season_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_profiles_student_record_id_key" ON "player_profiles"("student_record_id");

-- AddForeignKey
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_student_record_id_fkey" FOREIGN KEY ("student_record_id") REFERENCES "student_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_competition_definition_id_fkey" FOREIGN KEY ("competition_definition_id") REFERENCES "competition_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_student_record_id_fkey" FOREIGN KEY ("student_record_id") REFERENCES "student_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_records" ADD CONSTRAINT "student_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_definitions" ADD CONSTRAINT "competition_definitions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporter_profiles" ADD CONSTRAINT "reporter_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporter_score_entries" ADD CONSTRAINT "reporter_score_entries_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "reporter_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporter_correction_cases" ADD CONSTRAINT "reporter_correction_cases_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "reporter_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporter_contributions" ADD CONSTRAINT "reporter_contributions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "reporter_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporter_reinstatements" ADD CONSTRAINT "reporter_reinstatements_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "reporter_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

