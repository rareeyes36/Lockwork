CREATE TABLE submission_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   uuid NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  kind            text NOT NULL,
  url             text NOT NULL,
  label           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT submission_assets_kind_check CHECK (
    kind IN ('file', 'link')
  )
);

CREATE INDEX submission_assets_submission_id_idx
  ON submission_assets (submission_id);
