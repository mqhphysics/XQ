BEGIN;
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'SYSTEM_MESSAGE';
CREATE TABLE ai_moderation_settings (
 organization_id uuid PRIMARY KEY CONSTRAINT ai_moderation_settings_org_fkey REFERENCES organizations(id) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT false, base_url varchar(512) NOT NULL DEFAULT '', model varchar(120) NOT NULL DEFAULT '', protocol varchar(32) NOT NULL DEFAULT 'CHAT_COMPLETIONS',
 encrypted_key text, policies jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1, updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE TABLE ai_moderation_reviews (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL CONSTRAINT ai_moderation_reviews_org_fkey REFERENCES organizations(id) ON DELETE RESTRICT,
 resource_type varchar(32) NOT NULL CHECK(resource_type IN ('POST','MEDIA','USER_AVATAR','PLAYER_AVATAR','COMMENT')), target_id uuid NOT NULL, purpose varchar(40) NOT NULL,
 content_version varchar(120) NOT NULL, content_hash char(64) NOT NULL, source jsonb NOT NULL,
 status varchar(16) NOT NULL DEFAULT 'QUEUED', decision varchar(16), summary varchar(1000), needs_human_review boolean NOT NULL DEFAULT false,
 attempts integer NOT NULL DEFAULT 0, lease_until timestamptz(3), reviewed_at timestamptz(3), reviewed_by_user_id uuid, created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now(),
 CONSTRAINT ai_moderation_reviews_content_key UNIQUE(organization_id,resource_type,target_id,content_hash)
);
CREATE INDEX ai_moderation_reviews_queue_idx ON ai_moderation_reviews(status,lease_until,created_at);
CREATE INDEX ai_moderation_reviews_human_idx ON ai_moderation_reviews(organization_id,needs_human_review,reviewed_at);
COMMIT;
