-- CreateEnum
CREATE TYPE "verification_level" AS ENUM ('UNVERIFIED', 'STUDENT_VERIFIED', 'PLAYER_CONFIRMED', 'STAFF_VERIFIED');

-- CreateEnum
CREATE TYPE "player_position" AS ENUM ('GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD');

-- CreateEnum
CREATE TYPE "dominant_foot" AS ENUM ('LEFT', 'RIGHT', 'BOTH');

-- CreateEnum
CREATE TYPE "match_event_type" AS ENUM ('GOAL', 'OWN_GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION');

-- CreateEnum
CREATE TYPE "post_type" AS ENUM ('OFFICIAL', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "post_status" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN');

-- AlterTable
ALTER TABLE "app_users" ADD COLUMN     "avatar_url" VARCHAR(512),
ADD COLUMN     "bio" VARCHAR(280),
ADD COLUMN     "player_profile_id" UUID,
ADD COLUMN     "verification_level" "verification_level" NOT NULL DEFAULT 'UNVERIFIED';

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "attendance" INTEGER,
ADD COLUMN     "away_penalty_score" INTEGER,
ADD COLUMN     "away_score" INTEGER,
ADD COLUMN     "home_penalty_score" INTEGER,
ADD COLUMN     "home_score" INTEGER,
ADD COLUMN     "status_reason" VARCHAR(240),
ADD COLUMN     "summary" VARCHAR(800);

-- AlterTable
ALTER TABLE "player_profiles" ADD COLUMN     "academic_year" VARCHAR(32),
ADD COLUMN     "bio" VARCHAR(600),
ADD COLUMN     "dominant_foot" "dominant_foot",
ADD COLUMN     "height_cm" INTEGER,
ADD COLUMN     "hometown" VARCHAR(120),
ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "major" VARCHAR(120),
ADD COLUMN     "position" "player_position",
ADD COLUMN     "profile_color" VARCHAR(16),
ADD COLUMN     "secondary_position" "player_position";

-- AlterTable
ALTER TABLE "team_registrations" ADD COLUMN     "group_id" UUID;

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "college_name" VARCHAR(160),
ADD COLUMN     "description" VARCHAR(600),
ADD COLUMN     "founded_year" INTEGER,
ADD COLUMN     "motto" VARCHAR(160),
ADD COLUMN     "primary_color" VARCHAR(16),
ADD COLUMN     "secondary_color" VARCHAR(16);

-- CreateTable
CREATE TABLE "password_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "password_hash" VARCHAR(256) NOT NULL,
    "password_salt" VARCHAR(128) NOT NULL,
    "algorithm" VARCHAR(32) NOT NULL DEFAULT 'scrypt-v1',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_team_preferences" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_team_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "player_id" UUID,
    "related_player_id" UUID,
    "type" "match_event_type" NOT NULL,
    "minute" INTEGER NOT NULL,
    "stoppage_minute" INTEGER,
    "description" VARCHAR(240),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_appearances" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "shirt_number" VARCHAR(16),
    "starter" BOOLEAN NOT NULL DEFAULT false,
    "minutes_played" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_appearances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tournament_id" UUID,
    "author_user_id" UUID,
    "type" "post_type" NOT NULL DEFAULT 'COMMUNITY',
    "status" "post_status" NOT NULL DEFAULT 'PUBLISHED',
    "title" VARCHAR(180),
    "body" VARCHAR(2000) NOT NULL,
    "image_url" VARCHAR(512),
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_likes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_comments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_credentials_user_id_key" ON "password_credentials"("user_id");

-- CreateIndex
CREATE INDEX "user_team_preferences_org_user_primary_idx" ON "user_team_preferences"("organization_id", "user_id", "is_primary");

-- CreateIndex
CREATE UNIQUE INDEX "user_team_preferences_user_id_team_id_key" ON "user_team_preferences"("user_id", "team_id");

-- A user can follow many teams but can only designate one primary team.
CREATE UNIQUE INDEX "user_team_preferences_one_primary_per_user_key"
ON "user_team_preferences"("organization_id", "user_id")
WHERE "is_primary" = true;

-- CreateIndex
CREATE INDEX "match_events_match_id_minute_sort_idx" ON "match_events"("match_id", "minute", "sort_order");

-- CreateIndex
CREATE INDEX "match_events_org_player_type_idx" ON "match_events"("organization_id", "player_id", "type");

-- CreateIndex
CREATE INDEX "match_events_org_related_player_type_idx" ON "match_events"("organization_id", "related_player_id", "type");

-- CreateIndex
CREATE INDEX "match_appearances_org_player_match_idx" ON "match_appearances"("organization_id", "player_id", "match_id");

-- CreateIndex
CREATE INDEX "match_appearances_match_team_starter_idx" ON "match_appearances"("match_id", "team_id", "starter");

-- CreateIndex
CREATE UNIQUE INDEX "match_appearances_match_id_player_id_key" ON "match_appearances"("match_id", "player_id");

-- CreateIndex
CREATE INDEX "posts_org_status_published_at_idx" ON "posts"("organization_id", "status", "published_at");

-- CreateIndex
CREATE INDEX "posts_tournament_status_published_at_idx" ON "posts"("tournament_id", "status", "published_at");

-- CreateIndex
CREATE INDEX "post_likes_org_user_created_at_idx" ON "post_likes"("organization_id", "user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "post_likes_post_id_user_id_key" ON "post_likes"("post_id", "user_id");

-- CreateIndex
CREATE INDEX "post_comments_post_id_created_at_idx" ON "post_comments"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "post_comments_org_user_created_at_idx" ON "post_comments"("organization_id", "user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_users_player_profile_id_key" ON "app_users"("player_profile_id");

-- CreateIndex
CREATE INDEX "team_registrations_group_id_team_id_idx" ON "team_registrations"("group_id", "team_id");

-- AddForeignKey
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_player_profile_id_fkey" FOREIGN KEY ("player_profile_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_credentials" ADD CONSTRAINT "password_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_registrations" ADD CONSTRAINT "team_registrations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "tournament_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_team_preferences" ADD CONSTRAINT "user_team_preferences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_team_preferences" ADD CONSTRAINT "user_team_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_team_preferences" ADD CONSTRAINT "user_team_preferences_team_organization_fkey" FOREIGN KEY ("team_id", "organization_id") REFERENCES "teams"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_team_organization_fkey" FOREIGN KEY ("team_id", "organization_id") REFERENCES "teams"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_related_player_id_fkey" FOREIGN KEY ("related_player_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_appearances" ADD CONSTRAINT "match_appearances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_appearances" ADD CONSTRAINT "match_appearances_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_appearances" ADD CONSTRAINT "match_appearances_team_organization_fkey" FOREIGN KEY ("team_id", "organization_id") REFERENCES "teams"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_appearances" ADD CONSTRAINT "match_appearances_player_organization_fkey" FOREIGN KEY ("player_id", "organization_id") REFERENCES "player_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep score and timeline facts within sensible ranges even when data is imported.
ALTER TABLE "matches" ADD CONSTRAINT "matches_scores_non_negative_check"
CHECK (
  ("home_score" IS NULL OR "home_score" >= 0)
  AND ("away_score" IS NULL OR "away_score" >= 0)
  AND ("home_penalty_score" IS NULL OR "home_penalty_score" >= 0)
  AND ("away_penalty_score" IS NULL OR "away_penalty_score" >= 0)
);

ALTER TABLE "match_events" ADD CONSTRAINT "match_events_minute_check"
CHECK ("minute" BETWEEN 0 AND 180 AND ("stoppage_minute" IS NULL OR "stoppage_minute" BETWEEN 0 AND 30));

ALTER TABLE "match_appearances" ADD CONSTRAINT "match_appearances_minutes_check"
CHECK ("minutes_played" BETWEEN 0 AND 180);
