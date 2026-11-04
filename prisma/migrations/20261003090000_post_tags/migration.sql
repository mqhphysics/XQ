CREATE TYPE "post_tag_kind" AS ENUM ('TOPIC', 'TEAM', 'PLAYER');

CREATE UNIQUE INDEX "posts_id_organization_id_key" ON "posts"("id", "organization_id");

CREATE TABLE "post_tags" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "post_id" UUID NOT NULL,
  "kind" "post_tag_kind" NOT NULL,
  "key" VARCHAR(128) NOT NULL,
  "label" VARCHAR(160) NOT NULL,
  "position" INTEGER NOT NULL,
  "team_id" UUID,
  "player_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_tags_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "post_tags_target_shape_check" CHECK (
    ("kind" = 'TOPIC' AND "team_id" IS NULL AND "player_id" IS NULL) OR
    ("kind" = 'TEAM' AND "team_id" IS NOT NULL AND "player_id" IS NULL) OR
    ("kind" = 'PLAYER' AND "player_id" IS NOT NULL AND "team_id" IS NULL)
  ),
  CONSTRAINT "post_tags_position_check" CHECK ("position" BETWEEN 0 AND 9)
);

CREATE UNIQUE INDEX "post_tags_post_id_key_key" ON "post_tags"("post_id", "key");
CREATE INDEX "post_tags_org_team_post_idx" ON "post_tags"("organization_id", "team_id", "post_id");
CREATE INDEX "post_tags_org_player_post_idx" ON "post_tags"("organization_id", "player_id", "post_id");
CREATE INDEX "post_tags_org_key_idx" ON "post_tags"("organization_id", "key");

ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_post_organization_fkey"
  FOREIGN KEY ("post_id", "organization_id") REFERENCES "posts"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_team_organization_fkey"
  FOREIGN KEY ("team_id", "organization_id") REFERENCES "teams"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_player_organization_fkey"
  FOREIGN KEY ("player_id", "organization_id") REFERENCES "player_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
