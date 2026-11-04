ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'TEAM_COACH';
ALTER TABLE role_assignments ADD CONSTRAINT role_assignments_coach_team_scope_check
  CHECK (role::text <> 'TEAM_COACH' OR (scope_type::text = 'TEAM' AND organization_id IS NOT NULL));

CREATE TABLE identity_records (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  kind VARCHAR(32) NOT NULL, display_name VARCHAR(120) NOT NULL,
  team_id UUID, player_profile_id UUID,
  scope_type VARCHAR(32) NOT NULL, scope_id VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', linked_user_id UUID REFERENCES app_users(id) ON DELETE RESTRICT,
  granted_assignment_id UUID REFERENCES role_assignments(id) ON DELETE RESTRICT,
  created_by_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id, organization_id) REFERENCES teams(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (player_profile_id, organization_id) REFERENCES player_profiles(id, organization_id) ON DELETE RESTRICT,
  CHECK (kind IN ('STUDENT', 'PLAYER', 'TEAM_CAPTAIN', 'TEAM_COACH', 'MATCH_REPORTER')),
  CHECK (status IN ('ACTIVE', 'REVOKED')),
  CHECK ((kind IN ('TEAM_CAPTAIN','TEAM_COACH') AND team_id IS NOT NULL AND scope_type = 'TEAM' AND scope_id = team_id::text AND player_profile_id IS NULL)
    OR (kind = 'MATCH_REPORTER' AND scope_type IN ('MATCH','TOURNAMENT') AND team_id IS NULL AND player_profile_id IS NULL)
    OR (kind = 'PLAYER' AND player_profile_id IS NOT NULL AND scope_type = 'ORGANIZATION' AND scope_id = organization_id::text AND team_id IS NULL)
    OR (kind = 'STUDENT' AND player_profile_id IS NULL AND scope_type = 'ORGANIZATION' AND scope_id = organization_id::text AND team_id IS NULL))
);
CREATE INDEX identity_records_org_name_status_idx ON identity_records(organization_id, display_name, status);
CREATE TABLE identity_applications (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  kind VARCHAR(32) NOT NULL, team_id UUID, candidate_id VARCHAR(64), message VARCHAR(1000) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING', version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  resolved_candidate_id VARCHAR(64), reviewed_by_user_id UUID REFERENCES app_users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ(3), decision_note VARCHAR(1000),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id, organization_id) REFERENCES teams(id, organization_id) ON DELETE RESTRICT,
  CHECK (kind IN ('STUDENT', 'PLAYER', 'TEAM_CAPTAIN', 'TEAM_COACH', 'MATCH_REPORTER')),
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  CHECK (kind NOT IN ('TEAM_CAPTAIN','TEAM_COACH') OR team_id IS NOT NULL),
  CHECK ((status = 'PENDING' AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL)
    OR (status <> 'PENDING' AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL AND decision_note IS NOT NULL))
);
CREATE INDEX identity_applications_org_user_status_idx ON identity_applications(organization_id, user_id, status);
CREATE UNIQUE INDEX identity_applications_one_pending_key ON identity_applications(organization_id, user_id, kind, COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE status = 'PENDING';
