CREATE TABLE bot_agents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name              text NOT NULL,
  kind              text NOT NULL,
  managing_role_id  uuid REFERENCES roles (id) ON DELETE SET NULL,
  parent_bot_id     uuid REFERENCES bot_agents (id) ON DELETE SET NULL,
  job_id            uuid REFERENCES jobs (id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'active',
  config_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_agents_kind_check CHECK (
    kind IN ('lead', 'worker', 'job_scoped')
  ),
  CONSTRAINT bot_agents_status_check CHECK (
    status IN ('active', 'stopped')
  ),
  CONSTRAINT bot_agents_lead_has_role CHECK (
    kind <> 'lead' OR managing_role_id IS NOT NULL
  ),
  CONSTRAINT bot_agents_job_scoped_has_job CHECK (
    kind <> 'job_scoped' OR job_id IS NOT NULL
  )
);

-- At most one lead bot per role
CREATE UNIQUE INDEX bot_agents_one_lead_per_role_idx
  ON bot_agents (managing_role_id)
  WHERE kind = 'lead' AND managing_role_id IS NOT NULL;

CREATE INDEX bot_agents_workspace_id_idx ON bot_agents (workspace_id);
CREATE INDEX bot_agents_job_id_idx ON bot_agents (job_id);
