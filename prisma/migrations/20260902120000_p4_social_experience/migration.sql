CREATE TYPE "team_membership_status" AS ENUM ('ACTIVE', 'REMOVED');
CREATE TYPE "team_join_application_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "notification_type" AS ENUM ('POST_LIKED', 'POST_COMMENTED', 'COMMENT_REPLIED', 'TEAM_APPLICATION', 'TEAM_APPLICATION_DECIDED', 'REPORT_CREATED', 'REPORT_UPDATED', 'DIRECT_MESSAGE');
CREATE TYPE "report_target_type" AS ENUM ('POST', 'COMMENT', 'MATCH_REVIEW', 'USER', 'FEEDBACK');
CREATE TYPE "report_status" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED');

ALTER TABLE "player_profiles" ADD COLUMN "avatar_url" VARCHAR(512);
ALTER TABLE "post_comments"
  ADD COLUMN "hidden_at" TIMESTAMPTZ(3),
  ADD COLUMN "parent_comment_id" UUID;
ALTER TABLE "posts" ADD COLUMN "team_id" UUID;

CREATE TABLE "user_player_follows" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "player_profile_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_player_follows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_memberships" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "team_id" UUID NOT NULL,
  "user_id" UUID,
  "player_profile_id" UUID,
  "position" "player_position",
  "status" "team_membership_status" NOT NULL DEFAULT 'ACTIVE',
  "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "team_memberships_identity_check" CHECK ("user_id" IS NOT NULL OR "player_profile_id" IS NOT NULL)
);

CREATE TABLE "team_join_applications" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "team_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "player_profile_id" UUID,
  "requested_position" "player_position",
  "message" VARCHAR(500),
  "status" "team_join_application_status" NOT NULL DEFAULT 'PENDING',
  "reviewed_by_user_id" UUID,
  "reviewed_at" TIMESTAMPTZ(3),
  "decision_note" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_join_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_notifications" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "recipient_user_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "type" "notification_type" NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "body" VARCHAR(500),
  "link_path" VARCHAR(512),
  "metadata" JSONB,
  "deduplication_key" VARCHAR(200),
  "read_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "content_reports" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "reporter_user_id" UUID NOT NULL,
  "target_type" "report_target_type" NOT NULL,
  "target_id" UUID,
  "reason" VARCHAR(120) NOT NULL,
  "details" VARCHAR(1000),
  "status" "report_status" NOT NULL DEFAULT 'OPEN',
  "handled_by_user_id" UUID,
  "resolution" VARCHAR(1000),
  "action_taken" VARCHAR(120),
  "handled_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_reports_target_check" CHECK (
    ("target_type" = 'FEEDBACK' AND "target_id" IS NULL)
    OR ("target_type" <> 'FEEDBACK' AND "target_id" IS NOT NULL)
  )
);

CREATE TABLE "direct_conversations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_one_id" UUID NOT NULL,
  "user_two_id" UUID NOT NULL,
  "last_message_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "direct_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "direct_conversations_distinct_users_check" CHECK ("user_one_id" <> "user_two_id"),
  CONSTRAINT "direct_conversations_canonical_order_check" CHECK ("user_one_id"::text < "user_two_id"::text)
);

CREATE TABLE "direct_messages" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "sender_user_id" UUID NOT NULL,
  "client_message_id" VARCHAR(120) NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "read_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_player_follows_org_user_created_at_idx" ON "user_player_follows"("organization_id", "user_id", "created_at");
CREATE UNIQUE INDEX "user_player_follows_user_id_player_profile_id_key" ON "user_player_follows"("user_id", "player_profile_id");
CREATE INDEX "team_memberships_org_team_status_idx" ON "team_memberships"("organization_id", "team_id", "status");
CREATE UNIQUE INDEX "team_memberships_team_id_user_id_key" ON "team_memberships"("team_id", "user_id");
CREATE UNIQUE INDEX "team_memberships_team_id_player_profile_id_key" ON "team_memberships"("team_id", "player_profile_id");
CREATE INDEX "team_join_applications_org_team_status_created_idx" ON "team_join_applications"("organization_id", "team_id", "status", "created_at");
CREATE UNIQUE INDEX "team_join_applications_team_id_user_id_key" ON "team_join_applications"("team_id", "user_id");
CREATE INDEX "user_notifications_org_recipient_read_created_idx" ON "user_notifications"("organization_id", "recipient_user_id", "read_at", "created_at");
CREATE UNIQUE INDEX "user_notifications_recipient_deduplication_key" ON "user_notifications"("recipient_user_id", "deduplication_key");
CREATE INDEX "content_reports_org_status_created_idx" ON "content_reports"("organization_id", "status", "created_at");
CREATE INDEX "content_reports_reporter_created_idx" ON "content_reports"("reporter_user_id", "created_at");
CREATE INDEX "direct_conversations_org_last_message_at_idx" ON "direct_conversations"("organization_id", "last_message_at");
CREATE UNIQUE INDEX "direct_conversations_org_user_one_user_two_key" ON "direct_conversations"("organization_id", "user_one_id", "user_two_id");
CREATE UNIQUE INDEX "direct_conversations_id_organization_id_key" ON "direct_conversations"("id", "organization_id");
CREATE INDEX "direct_messages_conversation_created_at_idx" ON "direct_messages"("conversation_id", "created_at");
CREATE INDEX "direct_messages_org_sender_created_at_idx" ON "direct_messages"("organization_id", "sender_user_id", "created_at");
CREATE UNIQUE INDEX "direct_messages_conversation_sender_client_key" ON "direct_messages"("conversation_id", "sender_user_id", "client_message_id");
CREATE INDEX "post_comments_parent_created_at_idx" ON "post_comments"("parent_comment_id", "created_at");
CREATE INDEX "posts_team_status_published_at_idx" ON "posts"("team_id", "status", "published_at");

ALTER TABLE "user_player_follows" ADD CONSTRAINT "user_player_follows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_player_follows" ADD CONSTRAINT "user_player_follows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_player_follows" ADD CONSTRAINT "user_player_follows_player_organization_fkey" FOREIGN KEY ("player_profile_id", "organization_id") REFERENCES "player_profiles"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_organization_fkey" FOREIGN KEY ("team_id", "organization_id") REFERENCES "teams"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_player_organization_fkey" FOREIGN KEY ("player_profile_id", "organization_id") REFERENCES "player_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_join_applications" ADD CONSTRAINT "team_join_applications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_join_applications" ADD CONSTRAINT "team_join_applications_team_organization_fkey" FOREIGN KEY ("team_id", "organization_id") REFERENCES "teams"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_join_applications" ADD CONSTRAINT "team_join_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_join_applications" ADD CONSTRAINT "team_join_applications_player_organization_fkey" FOREIGN KEY ("player_profile_id", "organization_id") REFERENCES "player_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_join_applications" ADD CONSTRAINT "team_join_applications_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "posts" ADD CONSTRAINT "posts_team_organization_fkey" FOREIGN KEY ("team_id", "organization_id") REFERENCES "teams"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "post_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_handled_by_user_id_fkey" FOREIGN KEY ("handled_by_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "direct_conversations" ADD CONSTRAINT "direct_conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "direct_conversations" ADD CONSTRAINT "direct_conversations_user_one_id_fkey" FOREIGN KEY ("user_one_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "direct_conversations" ADD CONSTRAINT "direct_conversations_user_two_id_fkey" FOREIGN KEY ("user_two_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_conversation_organization_fkey" FOREIGN KEY ("conversation_id", "organization_id") REFERENCES "direct_conversations"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
