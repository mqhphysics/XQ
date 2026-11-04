CREATE TABLE "match_technical_logs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "match_id" UUID NOT NULL,
  "recorder_user_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "operations" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "match_technical_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "technical_logs_version_check" CHECK ("version" >= 0),
  CONSTRAINT "technical_logs_array_check" CHECK (jsonb_typeof("operations") = 'array'),
  CONSTRAINT "technical_logs_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "technical_logs_match_org_fkey" FOREIGN KEY ("match_id","organization_id") REFERENCES "matches"("id","organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "technical_logs_recorder_fkey" FOREIGN KEY ("recorder_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "technical_logs_org_match_recorder_key" ON "match_technical_logs"("organization_id","match_id","recorder_user_id");
