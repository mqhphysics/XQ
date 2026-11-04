CREATE TABLE "user_badge_preferences" (
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "preferred_kind" VARCHAR(32),
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_badge_preferences_pkey" PRIMARY KEY ("organization_id", "user_id"),
  CONSTRAINT "user_badge_preferences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "user_badge_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
