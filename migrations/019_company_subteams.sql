-- Dante correction: company root; teams only as sub-teams under company

CREATE TABLE teams (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  parent_team_id   uuid REFERENCES teams (id) ON DELETE SET NULL,
  name             text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_company_name_unique UNIQUE (company_id, name)
);

CREATE INDEX teams_company_id_idx ON teams (company_id);
CREATE INDEX teams_parent_team_id_idx ON teams (parent_team_id);

ALTER TABLE jobs
  ADD COLUMN team_id uuid REFERENCES teams (id) ON DELETE SET NULL;

CREATE INDEX jobs_team_id_idx ON jobs (team_id);

COMMENT ON TABLE workspaces IS 'Company root (product vocabulary: company, never team)';
COMMENT ON TABLE teams IS 'Sub-teams inside a company only; may nest via parent_team_id';
