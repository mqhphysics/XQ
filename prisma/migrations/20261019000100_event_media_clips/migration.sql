-- Round 11: per-event media (GIF or short MP4 clip) for every public match event, post-moderated.
ALTER TABLE managed_media_assets DROP CONSTRAINT managed_media_assets_purpose_check;
ALTER TABLE managed_media_assets ADD CONSTRAINT managed_media_assets_purpose_check
  CHECK (purpose IN ('GOAL_GIF','EVENT_CLIP','USER_AVATAR','USER_BACKGROUND','PLAYER_PORTRAIT'));

ALTER TABLE managed_media_assets DROP CONSTRAINT managed_media_assets_mime_type_check;
ALTER TABLE managed_media_assets ADD CONSTRAINT managed_media_assets_mime_type_check
  CHECK (mime_type IN ('image/gif','image/webp','video/mp4'));

ALTER TABLE managed_media_assets DROP CONSTRAINT managed_media_assets_bytes_check;
ALTER TABLE managed_media_assets ADD CONSTRAINT managed_media_assets_bytes_check
  CHECK (bytes > 0 AND bytes <= 10485760);

ALTER TABLE managed_media_assets DROP CONSTRAINT managed_media_assets_check;
ALTER TABLE managed_media_assets ADD CONSTRAINT managed_media_assets_check CHECK (
  (purpose = 'GOAL_GIF' AND match_id IS NOT NULL AND event_signature IS NOT NULL AND mime_type = 'image/gif')
  OR (purpose = 'EVENT_CLIP' AND match_id IS NOT NULL AND event_signature IS NOT NULL AND mime_type IN ('image/gif','video/mp4'))
  OR (purpose NOT IN ('GOAL_GIF','EVENT_CLIP') AND match_id IS NULL AND event_signature IS NULL AND mime_type = 'image/webp')
);
