ALTER TABLE "identity_applications"
  DROP CONSTRAINT "identity_applications_kind_check",
  DROP CONSTRAINT "identity_applications_status_check";

ALTER TABLE "identity_applications"
  ADD CONSTRAINT "identity_applications_kind_check"
    CHECK (kind IN ('STUDENT', 'PLAYER', 'TEAM_CAPTAIN', 'TEAM_COACH', 'MATCH_REPORTER', 'STUDENT_REGISTRATION')),
  ADD CONSTRAINT "identity_applications_status_check"
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED') OR (kind = 'STUDENT_REGISTRATION' AND status = 'RETURNED'));
