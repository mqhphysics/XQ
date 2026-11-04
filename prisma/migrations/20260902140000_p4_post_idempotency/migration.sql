ALTER TABLE "posts" ADD COLUMN "client_post_id" VARCHAR(120);

CREATE UNIQUE INDEX "posts_author_user_id_client_post_id_key"
  ON "posts"("author_user_id", "client_post_id");
