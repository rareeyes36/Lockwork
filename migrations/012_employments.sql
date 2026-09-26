CREATE TABLE employments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  employer_user_id   uuid NOT NULL REFERENCES users (id),
  employee_user_id   uuid NOT NULL REFERENCES users (id),
  job_id             uuid NOT NULL REFERENCES jobs (id),
  role_id            uuid REFERENCES roles (id) ON DELETE SET NULL,
  started_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employments_unique UNIQUE (workspace_id, employee_user_id, job_id),
  CONSTRAINT employments_not_self CHECK (employer_user_id <> employee_user_id)
);

CREATE INDEX employments_workspace_id_idx ON employments (workspace_id);
CREATE INDEX employments_employee_user_id_idx ON employments (employee_user_id);
