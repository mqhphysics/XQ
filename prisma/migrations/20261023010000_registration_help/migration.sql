CREATE TABLE registration_help_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  real_name VARCHAR(120),
  student_number VARCHAR(32),
  contact_email VARCHAR(254),
  details VARCHAR(1000) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED')),
  resolution VARCHAR(500),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT registration_help_org_client_key UNIQUE(organization_id,client_request_id)
);
CREATE INDEX registration_help_org_status_created_idx ON registration_help_requests(organization_id,status,created_at);
