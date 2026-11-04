ALTER TABLE "app_users" ADD COLUMN "show_player_identity" BOOLEAN NOT NULL DEFAULT true;

-- Keep the currently visible, approved user background as the user profile source.
-- Player covers and portraits are deliberately untouched.
UPDATE "app_users" AS u
SET "cover_url" = '/api/media-assets/' || a.id::text || '/content'
FROM (
  SELECT DISTINCT ON (target_id) id, target_id
  FROM managed_media_assets
  WHERE purpose = 'USER_BACKGROUND' AND status = 'APPROVED' AND visibility = 'ACTIVE'
  ORDER BY target_id, created_at DESC, id DESC
) AS a
WHERE u.id = a.target_id;
