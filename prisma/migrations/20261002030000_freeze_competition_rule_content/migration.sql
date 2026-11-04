-- Published/retired rule versions are historical facts. Corrections create a new version.
CREATE OR REPLACE FUNCTION protect_competition_rule_content()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.tournament_id IS DISTINCT FROM OLD.tournament_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.rules IS DISTINCT FROM OLD.rules THEN
    RAISE EXCEPTION 'Competition rule content is immutable; create a new version'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER competition_rule_content_immutable
BEFORE UPDATE ON competition_rule_versions
FOR EACH ROW EXECUTE FUNCTION protect_competition_rule_content();
