-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "quoted_post_id" UUID;

-- AlterTable
ALTER TABLE "post_comments" ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "post_favorites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_comment_likes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "comment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_comment_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "post_favorites_org_user_created_at_idx" ON "post_favorites"("organization_id", "user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "post_favorites_post_id_user_id_key" ON "post_favorites"("post_id", "user_id");

-- CreateIndex
CREATE INDEX "post_comment_likes_org_user_created_at_idx" ON "post_comment_likes"("organization_id", "user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "post_comment_likes_comment_id_user_id_key" ON "post_comment_likes"("comment_id", "user_id");

-- CreateIndex
CREATE INDEX "posts_quoted_post_id_idx" ON "posts"("quoted_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_comments_id_organization_id_key" ON "post_comments"("id", "organization_id");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_quoted_post_id_organization_id_fkey" FOREIGN KEY ("quoted_post_id", "organization_id") REFERENCES "posts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_favorites" ADD CONSTRAINT "post_favorites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_favorites" ADD CONSTRAINT "post_favorites_post_id_organization_id_fkey" FOREIGN KEY ("post_id", "organization_id") REFERENCES "posts"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_favorites" ADD CONSTRAINT "post_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comment_likes" ADD CONSTRAINT "post_comment_likes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comment_likes" ADD CONSTRAINT "post_comment_likes_comment_id_organization_id_fkey" FOREIGN KEY ("comment_id", "organization_id") REFERENCES "post_comments"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comment_likes" ADD CONSTRAINT "post_comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
