-- Profile + public feed shell (PROFILE_FEED.md / SOCIAL_CREDIT.md)
-- Public surfaces: jobs completed + demerits only. Never put escrow $ in feed payloads.
-- Depth already landed in 020_nested_escrow_ledger; this file only adds social shell tables.

CREATE TABLE IF NOT EXISTS employer_reputation (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  jobs_posted_count integer NOT NULL DEFAULT 0,
  jobs_paid_out_count integer NOT NULL DEFAULT 0,
  demerit_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employer_reputation_counts_nonneg CHECK (
    jobs_posted_count >= 0 AND jobs_paid_out_count >= 0 AND demerit_count >= 0
  )
);

CREATE TABLE IF NOT EXISTS feed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  company_id uuid REFERENCES workspaces (id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs (id) ON DELETE SET NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feed_events_kind_check CHECK (
    kind IN ('job_funded', 'submission', 'paid_hired', 'demerit', 'company_pulse')
  )
);

CREATE INDEX IF NOT EXISTS feed_events_created_at_idx ON feed_events (created_at DESC);
CREATE INDEX IF NOT EXISTS feed_events_company_id_idx ON feed_events (company_id);

CREATE TABLE IF NOT EXISTS form_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  scope_key text NOT NULL,
  fields_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_state_unique UNIQUE (company_id, scope_key)
);

COMMENT ON TABLE feed_events IS 'Public/operating feed cards; never put escrow $ in payload_json for public kinds';
COMMENT ON TABLE employer_reputation IS 'Employer-side counters for public profile (jobs paid out, demerits); no money fields';
