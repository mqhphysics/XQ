CREATE TABLE "match_checkins" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "match_checkins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "match_checkins_match_user_key" ON "match_checkins"("match_id", "user_id");
CREATE INDEX "match_checkins_org_match_created_idx" ON "match_checkins"("organization_id", "match_id", "created_at");
ALTER TABLE "match_checkins" ADD CONSTRAINT "match_checkins_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "match_checkins" ADD CONSTRAINT "match_checkins_match_organization_fkey" FOREIGN KEY ("match_id", "organization_id") REFERENCES "matches"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "match_checkins" ADD CONSTRAINT "match_checkins_user_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
