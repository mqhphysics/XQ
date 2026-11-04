ALTER TABLE "teams" ADD COLUMN "crest_url" VARCHAR(512);

ALTER TABLE "player_profiles"
  ADD COLUMN "portrait_url" VARCHAR(512),
  ADD COLUMN "rating_shooting" INTEGER,
  ADD COLUMN "rating_speed" INTEGER,
  ADD COLUMN "rating_dribbling" INTEGER,
  ADD COLUMN "rating_passing" INTEGER,
  ADD COLUMN "rating_defending" INTEGER;

ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_rating_range_check"
  CHECK (
    ("rating_shooting" IS NULL OR "rating_shooting" BETWEEN 0 AND 100) AND
    ("rating_speed" IS NULL OR "rating_speed" BETWEEN 0 AND 100) AND
    ("rating_dribbling" IS NULL OR "rating_dribbling" BETWEEN 0 AND 100) AND
    ("rating_passing" IS NULL OR "rating_passing" BETWEEN 0 AND 100) AND
    ("rating_defending" IS NULL OR "rating_defending" BETWEEN 0 AND 100)
  );
