CREATE TABLE "user_match_interests" (
    "organization_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "view_count" INTEGER NOT NULL DEFAULT 1 CHECK ("view_count" BETWEEN 1 AND 20),
    "last_viewed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_match_interests_pkey" PRIMARY KEY ("user_id", "match_id"),
    CONSTRAINT "user_match_interests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "user_match_interests_match_id_organization_id_fkey" FOREIGN KEY ("match_id", "organization_id") REFERENCES "matches"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_match_interests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "user_match_interests_organization_id_user_id_last_viewed_at_idx" ON "user_match_interests"("organization_id", "user_id", "last_viewed_at");
