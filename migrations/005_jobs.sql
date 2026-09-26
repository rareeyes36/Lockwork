-- winner_submission_id FK added in 009 after submissions exist
CREATE TABLE jobs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  employer_user_id       uuid NOT NULL REFERENCES users (id),
  title                  text NOT NULL,
  requirements           text NOT NULL,
  deadline_at            timestamptz NOT NULL,
  status                 text NOT NULL DEFAULT 'draft',
  winner_submission_id   uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jobs_status_check CHECK (
    status IN (
      'draft',
      'funded',
      'in_review',
      'paid',
      'expired_refunded',
      'cancelled_refunded'
    )
  ),
  CONSTRAINT jobs_paid_has_winner CHECK (
    status <> 'paid' OR winner_submission_id IS NOT NULL
  )
);

CREATE INDEX jobs_workspace_status_idx ON jobs (workspace_id, status);
CREATE INDEX jobs_deadline_funded_idx ON jobs (deadline_at)
  WHERE status = 'funded';
