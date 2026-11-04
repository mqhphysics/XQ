BEGIN;

CREATE FUNCTION xiaoqiu_default_avatar(p_kind text) RETURNS text
LANGUAGE sql VOLATILE STRICT AS $$
  SELECT '/api/media/defaults/' || CASE WHEN p_kind = 'player' THEN 'player' ELSE 'user' END
    || '-avatar-' || lpad((1 + floor(random() * 16))::integer::text, 2, '0') || '-v1.webp'
$$;

ALTER TABLE app_users ALTER COLUMN cover_url SET DEFAULT '/api/media/defaults/user-cover-v1.webp';
ALTER TABLE player_profiles ALTER COLUMN cover_url SET DEFAULT '/api/media/defaults/player-cover-v1.webp';
ALTER TABLE teams ALTER COLUMN cover_url SET DEFAULT '/api/media/defaults/team-cover-v1.webp';
ALTER TABLE app_users ALTER COLUMN avatar_url SET DEFAULT xiaoqiu_default_avatar('user');
ALTER TABLE player_profiles ALTER COLUMN avatar_url SET DEFAULT xiaoqiu_default_avatar('player');

-- Keep every existing uploaded picture; fill only absent media fields.
UPDATE app_users SET cover_url = '/api/media/defaults/user-cover-v1.webp', updated_at = now() WHERE cover_url IS NULL OR btrim(cover_url) = '';
UPDATE player_profiles SET cover_url = '/api/media/defaults/player-cover-v1.webp', updated_at = now() WHERE cover_url IS NULL OR btrim(cover_url) = '';
UPDATE teams SET cover_url = '/api/media/defaults/team-cover-v1.webp', updated_at = now() WHERE cover_url IS NULL OR btrim(cover_url) = '';
UPDATE app_users SET avatar_url = xiaoqiu_default_avatar('user'), updated_at = now() WHERE avatar_url IS NULL OR btrim(avatar_url) = '';
UPDATE player_profiles SET avatar_url = xiaoqiu_default_avatar('player'), updated_at = now() WHERE avatar_url IS NULL OR btrim(avatar_url) = '';

COMMIT;
