CREATE TABLE workspaces (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_user_id  uuid NOT NULL REFERENCES users (id),
  name              text NOT NULL,
  slug              citext NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspaces_slug_unique UNIQUE (slug)
);

CREATE INDEX workspaces_employer_user_id_idx ON workspaces (employer_user_id);
