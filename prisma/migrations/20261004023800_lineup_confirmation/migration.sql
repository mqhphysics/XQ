ALTER TABLE "team_lineup_plans"
  ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "confirmed_version" INTEGER,
  ADD COLUMN "confirmed_at" TIMESTAMPTZ(3),
  ADD COLUMN "confirmed_by_user_id" UUID;

ALTER TABLE "team_lineup_plans"
  ADD CONSTRAINT "team_lineup_plans_confirmation_author_fkey"
    FOREIGN KEY ("confirmed_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "team_lineup_plans_confirmed_revision_fkey"
    FOREIGN KEY ("id", "confirmed_version") REFERENCES "team_lineup_revisions"("plan_id", "version") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "team_lineup_plans_default_scope_check" CHECK (
    NOT "is_default" OR (
      "kind" = 'TACTIC' AND "tournament_id" IS NULL AND "match_id" IS NULL AND "roster_snapshot_id" IS NULL
    )
  ),
  ADD CONSTRAINT "team_lineup_plans_confirmation_scope_check" CHECK (
    ("confirmed_version" IS NULL AND "confirmed_at" IS NULL AND "confirmed_by_user_id" IS NULL)
    OR (
      "confirmed_version" IS NOT NULL AND "confirmed_version" > 0 AND "confirmed_version" <= "version" AND "kind" = 'MATCH_LINEUP'
      AND "match_id" IS NOT NULL AND "tournament_id" IS NOT NULL AND "roster_snapshot_id" IS NOT NULL
      AND "confirmed_at" IS NOT NULL AND "confirmed_by_user_id" IS NOT NULL
    )
  );

CREATE UNIQUE INDEX "team_lineup_plans_one_default_per_team"
  ON "team_lineup_plans"("organization_id", "team_id") WHERE "is_default";
CREATE UNIQUE INDEX "team_lineup_plans_one_confirmed_per_match"
  ON "team_lineup_plans"("organization_id", "team_id", "match_id") WHERE "confirmed_version" IS NOT NULL;
