-- Round 12: captains change their team's crest and background (post-moderated managed media).
ALTER TABLE managed_media_assets DROP CONSTRAINT managed_media_assets_purpose_check;
ALTER TABLE managed_media_assets ADD CONSTRAINT managed_media_assets_purpose_check
  CHECK (purpose IN ('GOAL_GIF','EVENT_CLIP','USER_AVATAR','USER_BACKGROUND','PLAYER_PORTRAIT','TEAM_CREST','TEAM_BACKGROUND'));

ALTER TABLE teams ADD COLUMN IF NOT EXISTS cover_url varchar(512);
