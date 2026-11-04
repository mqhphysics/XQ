-- Preserve the existing one-review-per-user model and all confirmed 1–5 ratings.
-- 0 represents a comment whose author has not rated this match yet.
ALTER TABLE "match_reviews" DROP CONSTRAINT "match_reviews_rating_check";
ALTER TABLE "match_reviews" ADD CONSTRAINT "match_reviews_rating_check"
  CHECK ("rating" BETWEEN 0 AND 5 AND
    ("rating" > 0 OR LENGTH(TRIM(COALESCE("body", ''))) > 0));
