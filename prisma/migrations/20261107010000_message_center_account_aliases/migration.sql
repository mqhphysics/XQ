CREATE TABLE "user_login_aliases" (
  "alias_normalized" VARCHAR(120) PRIMARY KEY,
  "user_id" UUID NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "user_login_aliases_user_id_idx" ON "user_login_aliases"("user_id");
INSERT INTO "user_login_aliases" ("alias_normalized", "user_id")
SELECT "login_name_normalized", "id" FROM "app_users"
WHERE "login_name_normalized" IS NOT NULL
ON CONFLICT ("alias_normalized") DO NOTHING;

CREATE TABLE "user_message_preferences" (
  "id" UUID PRIMARY KEY,
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "likes" VARCHAR(16) NOT NULL DEFAULT 'ALL' CHECK ("likes" IN ('ALL','FOLLOWING','NONE')),
  "replies" VARCHAR(16) NOT NULL DEFAULT 'ALL' CHECK ("replies" IN ('ALL','FOLLOWING','NONE')),
  "direct_messages" BOOLEAN NOT NULL DEFAULT TRUE,
  "system_messages" BOOLEAN NOT NULL DEFAULT TRUE,
  "badges" BOOLEAN NOT NULL DEFAULT TRUE,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "user_message_preferences_org_user_key"
  ON "user_message_preferences"("organization_id", "user_id");

CREATE TABLE "user_blocks" (
  "id" UUID PRIMARY KEY,
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "blocker_user_id" UUID NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "blocked_user_id" UUID NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_blocks_not_self" CHECK ("blocker_user_id" <> "blocked_user_id")
);
CREATE UNIQUE INDEX "user_blocks_org_blocker_blocked_key"
  ON "user_blocks"("organization_id", "blocker_user_id", "blocked_user_id");
CREATE INDEX "user_blocks_org_blocked_blocker_idx"
  ON "user_blocks"("organization_id", "blocked_user_id", "blocker_user_id");

ALTER TABLE "direct_messages"
  ADD COLUMN "kind" VARCHAR(24) NOT NULL DEFAULT 'USER',
  ADD COLUMN "metadata" JSONB,
  ADD CONSTRAINT "direct_messages_kind_check" CHECK ("kind" IN ('USER','ADMIN_NOTICE'));

ALTER TABLE "matches"
  ADD COLUMN "actual_started_at" TIMESTAMPTZ(3),
  ADD COLUMN "actual_ended_at" TIMESTAMPTZ(3),
  ADD COLUMN "reporter_completed_at" TIMESTAMPTZ(3);
