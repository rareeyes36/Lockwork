CREATE TABLE plugin_catalog (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text NOT NULL,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  CONSTRAINT plugin_catalog_key_unique UNIQUE (key)
);

CREATE TABLE workspace_plugins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  plugin_id       uuid NOT NULL REFERENCES plugin_catalog (id),
  status          text NOT NULL DEFAULT 'subscribed',
  config_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  subscribed_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_plugins_status_check CHECK (
    status IN ('subscribed', 'paused')
  ),
  CONSTRAINT workspace_plugins_unique UNIQUE (workspace_id, plugin_id)
);

CREATE INDEX workspace_plugins_workspace_id_idx
  ON workspace_plugins (workspace_id);

INSERT INTO plugin_catalog (key, name, description) VALUES
  ('video_edit', 'Video Edit', 'Video editing workspace integration'),
  ('daw', 'DAW', 'Digital audio workstation integration'),
  ('ide', 'IDE', 'Code IDE integration'),
  ('repo', 'Repo', 'Source repository integration');
