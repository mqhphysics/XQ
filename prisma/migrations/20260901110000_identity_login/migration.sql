ALTER TABLE "app_users"
ADD COLUMN "real_name" VARCHAR(120),
ADD COLUMN "real_name_normalized" VARCHAR(120),
ADD COLUMN "student_id" VARCHAR(32),
ADD COLUMN "email" VARCHAR(254),
ADD COLUMN "email_normalized" VARCHAR(254);

ALTER TABLE "player_profiles"
ADD COLUMN "student_id" VARCHAR(32);

CREATE UNIQUE INDEX "app_users_student_id_key"
ON "app_users"("student_id");

CREATE UNIQUE INDEX "app_users_email_normalized_key"
ON "app_users"("email_normalized");

CREATE INDEX "app_users_real_name_normalized_idx"
ON "app_users"("real_name_normalized");

CREATE UNIQUE INDEX "player_profiles_organization_id_student_id_key"
ON "player_profiles"("organization_id", "student_id");
