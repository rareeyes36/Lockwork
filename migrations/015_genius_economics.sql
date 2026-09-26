-- Genius fold #1–#3: release fee fields, employment seat stub, sponsor contributions

ALTER TABLE job_escrows
  ADD COLUMN platform_fee_bps integer NOT NULL DEFAULT 250,
  ADD COLUMN fee_amount numeric(20, 8),
  ADD COLUMN net_to_winner numeric(20, 8);

ALTER TABLE job_escrows
  ADD CONSTRAINT job_escrows_fee_bps_check CHECK (
    platform_fee_bps >= 0 AND platform_fee_bps <= 10000
  );

ALTER TABLE job_escrows
  ADD CONSTRAINT job_escrows_fee_on_paid CHECK (
    state <> 'paid'
    OR (
      fee_amount IS NOT NULL
      AND net_to_winner IS NOT NULL
      AND fee_amount + net_to_winner = amount
    )
  );

ALTER TABLE employments
  ADD COLUMN seat_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN seat_plan text,
  ADD COLUMN seat_started_at timestamptz;

ALTER TABLE employments
  ADD CONSTRAINT employments_seat_status_check CHECK (
    seat_status IN ('pending', 'active', 'churned')
  );

CREATE TABLE sponsor_contributions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id          uuid NOT NULL REFERENCES sponsors (id) ON DELETE CASCADE,
  job_id              uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  kind                text NOT NULL,
  amount              numeric(20, 8) NOT NULL,
  currency            text NOT NULL,
  state               text NOT NULL DEFAULT 'pledged',
  placement_fee_bps   integer,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsor_contributions_kind_check CHECK (
    kind IN ('co_lock', 'top_up', 'placement')
  ),
  CONSTRAINT sponsor_contributions_state_check CHECK (
    state IN ('pledged', 'locked', 'released', 'refunded')
  ),
  CONSTRAINT sponsor_contributions_amount_positive CHECK (amount > 0),
  CONSTRAINT sponsor_contributions_fee_bps_check CHECK (
    placement_fee_bps IS NULL
    OR (placement_fee_bps >= 0 AND placement_fee_bps <= 10000)
  )
);

CREATE INDEX sponsor_contributions_sponsor_id_idx
  ON sponsor_contributions (sponsor_id);
CREATE INDEX sponsor_contributions_job_id_idx
  ON sponsor_contributions (job_id);
