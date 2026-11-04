BEGIN;

ALTER TABLE teams ALTER COLUMN cover_url SET DEFAULT '/api/media/defaults/team-cover-v2.webp';

-- Update only the old built-in default. Uploaded backgrounds remain untouched.
UPDATE teams
SET cover_url = '/api/media/defaults/team-cover-v2.webp', updated_at = now()
WHERE cover_url IS NULL OR btrim(cover_url) = '' OR cover_url = '/api/media/defaults/team-cover-v1.webp';

-- Season display data may explicitly retain the old built-in cover.
UPDATE team_registrations
SET team_profile_snapshot = jsonb_set(team_profile_snapshot, '{coverUrl}', '"/api/media/defaults/team-cover-v2.webp"'::jsonb), updated_at = now()
WHERE team_profile_snapshot ->> 'coverUrl' = '/api/media/defaults/team-cover-v1.webp';

COMMIT;
