CREATE TYPE "organization_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'FROZEN', 'DELETED');
CREATE TYPE "membership_status" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'LEFT');
CREATE TYPE "role" AS ENUM (
  'PLATFORM_ADMIN',
  'ORGANIZATION_ADMIN',
  'TOURNAMENT_ADMIN',
  'TEAM_CAPTAIN',
  'MATCH_REPORTER',
  'OFFICIAL',
  'REVIEWER'
);
CREATE TYPE "role_scope_type" AS ENUM ('PLATFORM', 'ORGANIZATION', 'TOURNAMENT', 'TEAM', 'MATCH');
CREATE TYPE "audit_actor_type" AS ENUM (
  'USER',
  'MATCH_REPORTER',
  'OFFICIAL',
  'ADMIN',
  'SYSTEM',
  'WORKER',
  'IMPORT_BATCH',
  'EMERGENCY_SQL'
);
CREATE TYPE "outbox_job_status" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED_RETRYABLE',
  'FAILED_PERMANENT',
  'CANCELLED'
);

CREATE TABLE "organizations" (
  "id" UUID NOT NULL,
  "slug" VARCHAR(64) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "status" "organization_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_users" (
  "id" UUID NOT NULL,
  "login_name_normalized" VARCHAR(120),
  "display_name" VARCHAR(120) NOT NULL,
  "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_memberships" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" "membership_status" NOT NULL DEFAULT 'PENDING',
  "joined_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wechat_identities" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "provider" VARCHAR(32) NOT NULL DEFAULT 'WECHAT',
  "openid" VARCHAR(128) NOT NULL,
  "unionid" VARCHAR(128),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wechat_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "refresh_token_hash" VARCHAR(128) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "last_seen_at" TIMESTAMPTZ(3),
  "ip_address" INET,
  "user_agent" VARCHAR(512),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_assignments" (
  "id" UUID NOT NULL,
  "organization_id" UUID,
  "user_id" UUID NOT NULL,
  "role" "role" NOT NULL,
  "scope_type" "role_scope_type" NOT NULL,
  "scope_id" VARCHAR(64) NOT NULL,
  "granted_by_user_id" UUID,
  "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(3),
  CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_assignments_organization_scope_check"
    CHECK ("scope_type" = 'PLATFORM' OR "organization_id" IS NOT NULL)
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "actor_type" "audit_actor_type" NOT NULL,
  "actor_user_id" UUID,
  "actor_role_snapshot" JSONB,
  "action" VARCHAR(120) NOT NULL,
  "target_type" VARCHAR(120) NOT NULL,
  "target_id" VARCHAR(128) NOT NULL,
  "before_summary" JSONB,
  "after_summary" JSONB,
  "reason" VARCHAR(500),
  "request_id" VARCHAR(128) NOT NULL,
  "correlation_id" VARCHAR(128),
  "ip_address" INET,
  "user_agent" VARCHAR(512),
  "source" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "idempotency_records" (
  "id" UUID NOT NULL,
  "organization_id" UUID,
  "user_id" UUID NOT NULL,
  "route" VARCHAR(200) NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "response_status" INTEGER,
  "response_body" JSONB,
  "resource_type" VARCHAR(120),
  "resource_id" VARCHAR(128),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_jobs" (
  "id" UUID NOT NULL,
  "organization_id" UUID,
  "topic" VARCHAR(120) NOT NULL,
  "aggregate_type" VARCHAR(120) NOT NULL,
  "aggregate_id" VARCHAR(128) NOT NULL,
  "event_type" VARCHAR(120) NOT NULL,
  "payload" JSONB NOT NULL,
  "deduplication_key" VARCHAR(200),
  "correlation_id" VARCHAR(128),
  "status" "outbox_job_status" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 10,
  "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMPTZ(3),
  "locked_until" TIMESTAMPTZ(3),
  "locked_by" VARCHAR(120),
  "processed_at" TIMESTAMPTZ(3),
  "last_error_code" VARCHAR(120),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbox_jobs_attempt_count_check" CHECK ("attempt_count" >= 0),
  CONSTRAINT "outbox_jobs_max_attempts_check" CHECK ("max_attempts" > 0)
);

CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE UNIQUE INDEX "app_users_login_name_normalized_key"
  ON "app_users"("login_name_normalized")
  WHERE "login_name_normalized" IS NOT NULL;
CREATE UNIQUE INDEX "organization_memberships_organization_id_user_id_key"
  ON "organization_memberships"("organization_id", "user_id");
CREATE INDEX "organization_memberships_organization_id_status_idx"
  ON "organization_memberships"("organization_id", "status");
CREATE INDEX "organization_memberships_user_id_status_idx"
  ON "organization_memberships"("user_id", "status");
CREATE UNIQUE INDEX "wechat_identities_provider_openid_key"
  ON "wechat_identities"("provider", "openid");
CREATE INDEX "wechat_identities_user_id_idx" ON "wechat_identities"("user_id");
CREATE UNIQUE INDEX "user_sessions_refresh_token_hash_key"
  ON "user_sessions"("refresh_token_hash");
CREATE INDEX "user_sessions_user_id_revoked_at_expires_at_idx"
  ON "user_sessions"("user_id", "revoked_at", "expires_at");
CREATE UNIQUE INDEX "role_assignments_user_id_role_scope_type_scope_id_key"
  ON "role_assignments"("user_id", "role", "scope_type", "scope_id");
CREATE INDEX "role_assignments_organization_id_revoked_at_idx"
  ON "role_assignments"("organization_id", "revoked_at");
CREATE INDEX "role_assignments_user_id_revoked_at_idx"
  ON "role_assignments"("user_id", "revoked_at");
CREATE INDEX "audit_logs_organization_id_target_type_target_id_created_at_idx"
  ON "audit_logs"("organization_id", "target_type", "target_id", "created_at");
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");
CREATE UNIQUE INDEX "idempotency_records_user_id_route_idempotency_key_key"
  ON "idempotency_records"("user_id", "route", "idempotency_key");
CREATE INDEX "idempotency_records_organization_id_created_at_idx"
  ON "idempotency_records"("organization_id", "created_at");
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");
CREATE UNIQUE INDEX "outbox_jobs_deduplication_key_key"
  ON "outbox_jobs"("deduplication_key")
  WHERE "deduplication_key" IS NOT NULL;
CREATE INDEX "outbox_jobs_status_available_at_idx" ON "outbox_jobs"("status", "available_at");
CREATE INDEX "outbox_jobs_locked_until_idx" ON "outbox_jobs"("locked_until");
CREATE INDEX "outbox_jobs_correlation_id_idx" ON "outbox_jobs"("correlation_id");
CREATE INDEX "outbox_jobs_organization_id_created_at_idx"
  ON "outbox_jobs"("organization_id", "created_at");

ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wechat_identities"
  ADD CONSTRAINT "wechat_identities_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_sessions"
  ADD CONSTRAINT "user_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_assignments"
  ADD CONSTRAINT "role_assignments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_assignments"
  ADD CONSTRAINT "role_assignments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_assignments"
  ADD CONSTRAINT "role_assignments_granted_by_user_id_fkey"
  FOREIGN KEY ("granted_by_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "idempotency_records"
  ADD CONSTRAINT "idempotency_records_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "idempotency_records"
  ADD CONSTRAINT "idempotency_records_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outbox_jobs"
  ADD CONSTRAINT "outbox_jobs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
