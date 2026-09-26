CREATE TABLE role_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id         uuid NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  principal_type  text NOT NULL,
  user_id         uuid REFERENCES users (id) ON DELETE CASCADE,
  bot_agent_id    uuid REFERENCES bot_agents (id) ON DELETE CASCADE,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_assignments_principal_type_check CHECK (
    principal_type IN ('user', 'bot')
  ),
  CONSTRAINT role_assignments_principal_match CHECK (
    (principal_type = 'user' AND user_id IS NOT NULL AND bot_agent_id IS NULL)
    OR
    (principal_type = 'bot' AND bot_agent_id IS NOT NULL AND user_id IS NULL)
  )
);

CREATE UNIQUE INDEX role_assignments_user_unique_idx
  ON role_assignments (role_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX role_assignments_bot_unique_idx
  ON role_assignments (role_id, bot_agent_id)
  WHERE bot_agent_id IS NOT NULL;

CREATE INDEX role_assignments_role_id_idx ON role_assignments (role_id);
CREATE INDEX role_assignments_user_id_idx ON role_assignments (user_id);
CREATE INDEX role_assignments_bot_agent_id_idx ON role_assignments (bot_agent_id);
