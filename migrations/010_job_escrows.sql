CREATE TABLE job_escrows (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                uuid NOT NULL UNIQUE REFERENCES jobs (id) ON DELETE CASCADE,
  rail                  text NOT NULL,
  amount                numeric(20, 8) NOT NULL,
  currency              text NOT NULL,
  state                 text NOT NULL DEFAULT 'draft',
  escrow_ref            text,
  payer_user_id         uuid NOT NULL REFERENCES users (id),
  winner_payee_user_id  uuid REFERENCES users (id),
  funded_at             timestamptz,
  released_at           timestamptz,
  refunded_at           timestamptz,
  meta_json             jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT job_escrows_rail_check CHECK (
    rail IN ('custodial', 'onchain')
  ),
  CONSTRAINT job_escrows_state_check CHECK (
    state IN (
      'draft',
      'funded',
      'in_review',
      'paid',
      'expired_refunded',
      'cancelled_refunded'
    )
  ),
  CONSTRAINT job_escrows_amount_positive CHECK (amount > 0),
  CONSTRAINT job_escrows_paid_has_payee CHECK (
    state <> 'paid' OR winner_payee_user_id IS NOT NULL
  ),
  CONSTRAINT job_escrows_funded_timestamp CHECK (
    state = 'draft' OR funded_at IS NOT NULL
  )
);

CREATE INDEX job_escrows_state_idx ON job_escrows (state);
CREATE INDEX job_escrows_rail_idx ON job_escrows (rail);
