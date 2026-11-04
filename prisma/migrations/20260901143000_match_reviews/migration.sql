CREATE TABLE "match_reviews" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "match_reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "match_reviews_match_id_user_id_key"
ON "match_reviews"("match_id", "user_id");

CREATE INDEX "match_reviews_match_id_created_at_idx"
ON "match_reviews"("match_id", "created_at");

CREATE INDEX "match_reviews_org_user_created_at_idx"
ON "match_reviews"("organization_id", "user_id", "created_at");

ALTER TABLE "match_reviews"
ADD CONSTRAINT "match_reviews_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "match_reviews"
ADD CONSTRAINT "match_reviews_match_id_fkey"
FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "match_reviews"
ADD CONSTRAINT "match_reviews_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
