CREATE TABLE sponsors (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid REFERENCES workspaces (id) ON DELETE CASCADE,
  job_id            uuid REFERENCES jobs (id) ON DELETE CASCADE,
  sponsor_user_id   uuid REFERENCES users (id) ON DELETE SET NULL,
  name              text NOT NULL,
  kinds             text[] NOT NULL DEFAULT '{}',
  details           text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsors_scope_check CHECK (
    workspace_id IS NOT NULL OR job_id IS NOT NULL
  ),
  CONSTRAINT sponsors_kinds_nonempty CHECK (cardinality(kinds) >= 1),
  CONSTRAINT sponsors_kinds_allowed CHECK (
    kinds <@ ARRAY[
      'contributing',
      'financing',
      'software',
      'materials',
      'services'
    ]::text[]
  )
);

CREATE INDEX sponsors_workspace_id_idx ON sponsors (workspace_id);
CREATE INDEX sponsors_job_id_idx ON sponsors (job_id);
