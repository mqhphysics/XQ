ALTER TABLE "app_users" ADD COLUMN "email_verified_at" TIMESTAMPTZ(3);
CREATE TABLE "email_auth_codes" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "email_normalized" VARCHAR(254) NOT NULL,
  "purpose" VARCHAR(32) NOT NULL,
  "user_id" UUID REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "code_digest" VARCHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "send_status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "consumed_at" TIMESTAMPTZ(3),
  "ip_address" INET,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_auth_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_auth_codes_purpose_check" CHECK ("purpose" IN ('REGISTER','RESET_PASSWORD','LOGIN','VERIFY_EMAIL')),
  CONSTRAINT "email_auth_codes_attempts_check" CHECK ("attempts" >= 0)
);
CREATE INDEX "email_auth_codes_lookup_idx" ON "email_auth_codes" ("organization_id", "email_normalized", "purpose", "created_at");
CREATE INDEX "email_auth_codes_email_rate_idx" ON "email_auth_codes" ("email_normalized", "created_at");
CREATE INDEX "email_auth_codes_ip_rate_idx" ON "email_auth_codes" ("ip_address", "created_at");
CREATE INDEX "email_auth_codes_created_idx" ON "email_auth_codes" ("created_at");
