BEGIN;
CREATE TABLE "ai_moderation_providers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "base_url" VARCHAR(512) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "protocol" VARCHAR(32) NOT NULL DEFAULT 'CHAT_COMPLETIONS',
  "encrypted_key" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "last_tested_at" TIMESTAMPTZ(3),
  "test_successful" BOOLEAN,
  "test_latency_ms" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_moderation_providers_name_key" UNIQUE ("organization_id", "name"),
  CONSTRAINT "ai_moderation_providers_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "ai_moderation_providers_id_org_key" UNIQUE ("id", "organization_id")
);
ALTER TABLE "ai_moderation_settings" ADD COLUMN "active_profile_id" UUID;
INSERT INTO "ai_moderation_providers" ("organization_id", "name", "provider", "base_url", "model", "protocol", "encrypted_key")
SELECT "organization_id", '已保存服务', 'CUSTOM', "base_url", "model", "protocol", "encrypted_key"
FROM "ai_moderation_settings" WHERE "base_url" <> '';
UPDATE "ai_moderation_settings" s SET "active_profile_id" = p.id
FROM "ai_moderation_providers" p WHERE p.organization_id = s.organization_id;
ALTER TABLE "ai_moderation_settings" ADD CONSTRAINT "ai_moderation_settings_profile_fkey"
FOREIGN KEY ("active_profile_id", "organization_id") REFERENCES "ai_moderation_providers"("id", "organization_id") ON DELETE RESTRICT;
COMMIT;
