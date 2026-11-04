-- Round 12: a team has at most two active captains. Services reject a third grant with a clear
-- 409; this trigger is the backstop for any other writer (scripts, concurrent requests).
CREATE OR REPLACE FUNCTION enforce_team_captain_limit() RETURNS trigger AS $$
BEGIN
  IF NEW.role = 'TEAM_CAPTAIN' AND NEW.scope_type = 'TEAM' AND NEW.revoked_at IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('team-captains:' || lower(NEW.scope_id)));
    IF (SELECT count(*) FROM role_assignments
        WHERE role = 'TEAM_CAPTAIN' AND scope_type = 'TEAM' AND revoked_at IS NULL
          AND lower(scope_id) = lower(NEW.scope_id) AND user_id <> NEW.user_id AND id <> NEW.id) >= 2 THEN
      RAISE EXCEPTION 'TEAM_CAPTAIN_LIMIT: team % already has two captains', NEW.scope_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER role_assignments_team_captain_limit
  BEFORE INSERT OR UPDATE OF role, scope_type, scope_id, revoked_at, user_id ON role_assignments
  FOR EACH ROW EXECUTE FUNCTION enforce_team_captain_limit();
