CREATE TABLE submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  submitter_type      text NOT NULL,
  submitter_user_id   uuid REFERENCES users (id) ON DELETE CASCADE,
  submitter_bot_id    uuid REFERENCES bot_agents (id) ON DELETE CASCADE,
  demo_url            text,
  notes               text,
  status              text NOT NULL DEFAULT 'submitted',
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT submissions_submitter_type_check CHECK (
    submitter_type IN ('user', 'bot')
  ),
  CONSTRAINT submissions_submitter_match CHECK (
    (submitter_type = 'user' AND submitter_user_id IS NOT NULL AND submitter_bot_id IS NULL)
    OR
    (submitter_type = 'bot' AND submitter_bot_id IS NOT NULL AND submitter_user_id IS NULL)
  ),
  CONSTRAINT submissions_status_check CHECK (
    status IN ('submitted', 'withdrawn', 'selected', 'rejected')
  )
);

-- One active (non-withdrawn) submission per human submitter per job
CREATE UNIQUE INDEX submissions_one_active_user_idx
  ON submissions (job_id, submitter_user_id)
  WHERE submitter_user_id IS NOT NULL AND status <> 'withdrawn';

CREATE UNIQUE INDEX submissions_one_active_bot_idx
  ON submissions (job_id, submitter_bot_id)
  WHERE submitter_bot_id IS NOT NULL AND status <> 'withdrawn';

CREATE INDEX submissions_job_id_idx ON submissions (job_id);
