-- Round 12: 慕轻寒 (login 2025213387) becomes an organization administrator (admin center login
-- with the existing account and password) and a second captain of 物院一队. The existing captain
-- is kept. Idempotent: re-activates a revoked assignment instead of duplicating it.
BEGIN;
WITH target AS (
  SELECT u.id AS user_id, m.organization_id
  FROM app_users u
  JOIN organization_memberships m ON m.user_id = u.id AND m.status = 'ACTIVE'
  WHERE u.login_name_normalized = '2025213387'
    AND m.organization_id = '00000000-0000-4000-8000-000000000001'
), team AS (
  SELECT t.id FROM teams t
  WHERE t.organization_id = '00000000-0000-4000-8000-000000000001' AND t.name = '物院一队'
), grants AS (
  SELECT target.user_id, target.organization_id, 'ORGANIZATION_ADMIN'::role AS role,
         'ORGANIZATION'::role_scope_type AS scope_type, target.organization_id::text AS scope_id
  FROM target
  UNION ALL
  SELECT target.user_id, target.organization_id, 'TEAM_CAPTAIN'::role, 'TEAM'::role_scope_type, team.id::text
  FROM target, team
), applied AS (
  INSERT INTO role_assignments (id, organization_id, user_id, role, scope_type, scope_id, granted_at)
  SELECT gen_random_uuid(), organization_id, user_id, role, scope_type, scope_id, now() FROM grants
  ON CONFLICT (user_id, role, scope_type, scope_id)
    DO UPDATE SET revoked_at = NULL, organization_id = EXCLUDED.organization_id
  RETURNING organization_id, user_id, role, scope_type, scope_id
)
INSERT INTO audit_logs (id, organization_id, actor_type, action, target_type, target_id, after_summary, reason, request_id, source)
SELECT gen_random_uuid(), organization_id, 'EMERGENCY_SQL', 'ROLE_ASSIGNMENT_GRANTED', 'User', user_id::text,
       jsonb_build_object('role', role, 'scopeType', scope_type, 'scopeId', scope_id),
       '用户要求：慕轻寒获得管理后台权限并担任物院一队第二队长', 'r12-muqinghan-roles', 'release-sql'
FROM applied;
SELECT ra.role, ra.scope_type, ra.scope_id, ra.revoked_at
FROM role_assignments ra JOIN app_users u ON u.id = ra.user_id
WHERE u.login_name_normalized = '2025213387' AND ra.revoked_at IS NULL;
SELECT count(*) AS active_captains_of_wuyuan1 FROM role_assignments
WHERE role = 'TEAM_CAPTAIN' AND scope_type = 'TEAM' AND revoked_at IS NULL
  AND scope_id = (SELECT id::text FROM teams WHERE organization_id = '00000000-0000-4000-8000-000000000001' AND name = '物院一队');
COMMIT;
