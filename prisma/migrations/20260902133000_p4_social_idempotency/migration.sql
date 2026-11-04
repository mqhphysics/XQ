ALTER TABLE "post_comments" ADD COLUMN "client_comment_id" VARCHAR(120);
ALTER TABLE "content_reports" ADD COLUMN "client_report_id" VARCHAR(120);

CREATE UNIQUE INDEX "post_comments_user_id_client_comment_id_key"
  ON "post_comments"("user_id", "client_comment_id");
CREATE UNIQUE INDEX "content_reports_reporter_client_report_id_key"
  ON "content_reports"("reporter_user_id", "client_report_id");

ALTER TABLE "team_memberships" DROP CONSTRAINT "team_memberships_user_id_fkey";
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
