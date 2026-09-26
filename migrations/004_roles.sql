CREATE TABLE roles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name                text NOT NULL,
  parent_role_id      uuid REFERENCES roles (id) ON DELETE SET NULL,
  can_mint_roles      boolean NOT NULL DEFAULT false,
  created_by_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_workspace_name_unique UNIQUE (workspace_id, name)
);

CREATE INDEX roles_workspace_id_idx ON roles (workspace_id);
CREATE INDEX roles_parent_role_id_idx ON roles (parent_role_id);
