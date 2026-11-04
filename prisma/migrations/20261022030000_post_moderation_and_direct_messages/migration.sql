ALTER TABLE direct_messages
  ADD COLUMN moderation_status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN moderation_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN moderated_at TIMESTAMPTZ(3),
  ADD CONSTRAINT direct_messages_moderation_status_check CHECK (moderation_status IN ('PENDING', 'APPROVED', 'HIDDEN')),
  ADD CONSTRAINT direct_messages_moderation_version_check CHECK (moderation_version > 0);
CREATE INDEX direct_messages_org_moderation_created_idx ON direct_messages (organization_id, moderation_status, created_at);

-- User submissions become visible immediately and remain in the human review queue.
-- Never restore a rejected or hidden asset.
UPDATE managed_media_assets SET status='APPROVED', version=version+1
WHERE status='PENDING' AND visibility='ACTIVE'
  AND purpose IN ('USER_AVATAR','USER_BACKGROUND','PLAYER_PORTRAIT','TEAM_CREST','TEAM_BACKGROUND','GOAL_GIF','EVENT_CLIP');

UPDATE player_profiles AS p SET portrait_url='/api/media-assets/' || a.id::text || '/content'
FROM (
  SELECT DISTINCT ON (organization_id,target_id) id,organization_id,target_id
  FROM managed_media_assets
  WHERE purpose='PLAYER_PORTRAIT' AND status='APPROVED' AND visibility='ACTIVE'
  ORDER BY organization_id,target_id,created_at DESC,id DESC
) AS a WHERE p.id=a.target_id AND p.organization_id=a.organization_id;
