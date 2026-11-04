ALTER TABLE "email_auth_codes" DROP CONSTRAINT "email_auth_codes_purpose_check";
ALTER TABLE "email_auth_codes" ADD CONSTRAINT "email_auth_codes_purpose_check"
  CHECK ("purpose" IN ('REGISTER','RESET_PASSWORD','LOGIN','VERIFY_EMAIL','CHANGE_EMAIL_OLD','CHANGE_EMAIL_NEW'));
CREATE TABLE "email_change_requests" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "session_id" UUID NOT NULL REFERENCES "user_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "previous_email_normalized" VARCHAR(254),
  "new_email_normalized" VARCHAR(254),
  "old_verified_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "completed_at" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_change_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_change_requests_completed_check" CHECK ("completed_at" IS NULL OR ("new_email_normalized" IS NOT NULL AND ("previous_email_normalized" IS NULL OR "old_verified_at" IS NOT NULL)))
);
CREATE INDEX "email_change_requests_session_idx" ON "email_change_requests" ("user_id", "session_id", "expires_at");
ALTER TABLE "email_auth_codes" ADD COLUMN "context_id" UUID REFERENCES "email_change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_auth_codes" ADD CONSTRAINT "email_auth_codes_change_context_check"
  CHECK (("purpose" IN ('CHANGE_EMAIL_OLD','CHANGE_EMAIL_NEW')) = ("context_id" IS NOT NULL));
