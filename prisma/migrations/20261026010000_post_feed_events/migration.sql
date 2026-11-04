CREATE TABLE "post_feed_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "post_id" UUID NOT NULL,
  "client_event_id" UUID NOT NULL,
  "batch_id" UUID,
  "kind" VARCHAR(16) NOT NULL,
  "duration_ms" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_feed_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "post_feed_events_kind_check" CHECK ("kind" IN ('IMPRESSION', 'READ')),
  CONSTRAINT "post_feed_events_duration_check" CHECK ("duration_ms" BETWEEN 0 AND 120000),
  CONSTRAINT "post_feed_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "post_feed_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "post_feed_events_post_id_organization_id_fkey" FOREIGN KEY ("post_id", "organization_id") REFERENCES "posts"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "post_feed_events_user_client_key" ON "post_feed_events"("user_id", "client_event_id");
CREATE INDEX "post_feed_events_org_user_created_idx" ON "post_feed_events"("organization_id", "user_id", "created_at");
CREATE INDEX "post_feed_events_org_post_created_idx" ON "post_feed_events"("organization_id", "post_id", "created_at");
CREATE INDEX "post_feed_events_created_idx" ON "post_feed_events"("created_at");

ALTER TABLE "posts" ADD COLUMN "publication_source" VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "posts" ADD CONSTRAINT "posts_publication_source_check" CHECK ("publication_source" IN ('UNKNOWN', 'USER', 'SYSTEM'));
-- Older posts without explicit provenance stay UNKNOWN; do not infer a human from an avatar/name.
