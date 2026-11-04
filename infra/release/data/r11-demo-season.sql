-- Round 11: the complete 32-match 绿茵杯 fixture belongs to the demo season; the formal 2026
-- season stays empty (即将开赛). Idempotent; touches only the fixture tournament row.
BEGIN;
UPDATE tournaments AS t
SET season_id = s.id,
    name = '演示赛季 绿茵杯',
    updated_at = now()
FROM seasons AS s
WHERE s.organization_id = t.organization_id
  AND s.season_code = 'DEMO-CAMPUS'
  AND t.tournament_code = 'DEMO-GREEN-CUP-2026'
  AND (t.season_id IS DISTINCT FROM s.id OR t.name IS DISTINCT FROM '演示赛季 绿茵杯');
SELECT t.name, s.name AS season, (SELECT count(*) FROM matches m WHERE m.tournament_id = t.id) AS matches
FROM tournaments t JOIN seasons s ON s.id = t.season_id
WHERE t.tournament_code = 'DEMO-GREEN-CUP-2026';
COMMIT;
