-- CHECK constraints complement the additive Prisma model without new public enums.
CREATE TABLE managed_media_assets (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  uploader_user_id uuid NOT NULL,
  client_submission_id varchar(120) NOT NULL,
  purpose varchar(32) NOT NULL CHECK (purpose IN ('GOAL_GIF','USER_AVATAR','USER_BACKGROUND','PLAYER_PORTRAIT')),
  target_id uuid NOT NULL,
  target_label varchar(320) NOT NULL,
  match_id uuid,
  event_signature char(64),
  checksum char(64) NOT NULL,
  mime_type varchar(32) NOT NULL CHECK (mime_type IN ('image/gif','image/webp')),
  bytes integer NOT NULL CHECK (bytes > 0 AND bytes <= 6291456),
  width integer NOT NULL CHECK (width > 0 AND width <= 1600),
  height integer NOT NULL CHECK (height > 0 AND height <= 1600),
  frames integer NOT NULL CHECK (frames BETWEEN 1 AND 120),
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 0 AND 15000),
  status varchar(16) NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  visibility varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (visibility IN ('ACTIVE','HIDDEN','DELETED')),
  review_reason varchar(1000),
  reviewed_by_user_id uuid,
  reviewed_at timestamptz(3),
  visibility_changed_by_user_id uuid,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT managed_media_assets_submission_key UNIQUE (organization_id, uploader_user_id, client_submission_id),
  CONSTRAINT managed_media_assets_org_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT managed_media_assets_uploader_fkey FOREIGN KEY (uploader_user_id) REFERENCES app_users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT managed_media_assets_reviewer_fkey FOREIGN KEY (reviewed_by_user_id) REFERENCES app_users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT managed_media_assets_visibility_actor_fkey FOREIGN KEY (visibility_changed_by_user_id) REFERENCES app_users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ((purpose = 'GOAL_GIF' AND match_id IS NOT NULL AND event_signature IS NOT NULL AND mime_type = 'image/gif')
      OR (purpose <> 'GOAL_GIF' AND match_id IS NULL AND event_signature IS NULL AND mime_type = 'image/webp'))
);
-- target_id intentionally survives deleted/replaced match events: NEVER rebind by minute/player.
CREATE INDEX managed_media_assets_target_idx ON managed_media_assets(organization_id,purpose,target_id,status,visibility,created_at DESC);
CREATE INDEX managed_media_assets_queue_idx ON managed_media_assets(organization_id,status,created_at DESC);
CREATE INDEX managed_media_assets_uploader_idx ON managed_media_assets(organization_id,uploader_user_id,created_at DESC);
CREATE INDEX managed_media_assets_match_idx ON managed_media_assets(organization_id,match_id,target_id,created_at DESC);
