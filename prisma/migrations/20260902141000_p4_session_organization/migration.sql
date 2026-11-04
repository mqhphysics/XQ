ALTER TABLE "user_sessions" ADD COLUMN "organization_id" UUID;

-- 旧 token 没有可信的组织上下文。升级时统一失效，避免多组织账号被静默绑定到错误租户。
DELETE FROM "user_sessions";
ALTER TABLE "user_sessions" ALTER COLUMN "organization_id" SET NOT NULL;

CREATE INDEX "user_sessions_organization_id_revoked_at_expires_at_idx"
  ON "user_sessions"("organization_id", "revoked_at", "expires_at");

ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
