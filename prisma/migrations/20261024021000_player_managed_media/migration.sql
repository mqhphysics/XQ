BEGIN;
ALTER TABLE "managed_media_assets" DROP CONSTRAINT "managed_media_assets_purpose_check";
ALTER TABLE "managed_media_assets" ADD CONSTRAINT "managed_media_assets_purpose_check"
CHECK ("purpose" IN ('GOAL_GIF','EVENT_CLIP','USER_AVATAR','PLAYER_AVATAR','USER_BACKGROUND','PLAYER_BACKGROUND','PLAYER_PORTRAIT','TEAM_CREST','TEAM_BACKGROUND'));
COMMIT;
