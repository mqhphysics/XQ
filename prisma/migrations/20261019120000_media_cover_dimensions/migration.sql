-- Round 12: profile/team covers are stored up to 2240×800 (media-image.ts), but the table still
-- capped width/height at 1600, so saving any wide cover failed with a CHECK violation (500).
ALTER TABLE managed_media_assets DROP CONSTRAINT managed_media_assets_width_check;
ALTER TABLE managed_media_assets ADD CONSTRAINT managed_media_assets_width_check
  CHECK (width > 0 AND width <= 2560);
ALTER TABLE managed_media_assets DROP CONSTRAINT managed_media_assets_height_check;
ALTER TABLE managed_media_assets ADD CONSTRAINT managed_media_assets_height_check
  CHECK (height > 0 AND height <= 2560);
