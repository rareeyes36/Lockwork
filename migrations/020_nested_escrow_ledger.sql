-- Nested escrow ledger (OPEN_DECISIONS D1 / D2 / D4, proposed defaults)
--
-- A parent job's escrow can carve budget out to child jobs (0 bps, internal).
-- When the parent itself pays a winner, only the residual leaves the tree:
--   fee_amount + net_to_winner + carved_out_amount = amount
-- Refunds record how much actually went back to the payer.

ALTER TABLE jobs
  ADD COLUMN depth integer NOT NULL DEFAULT 1;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_depth_check CHECK (depth BETWEEN 1 AND 3);

ALTER TABLE job_escrows
  ADD COLUMN carved_out_amount numeric(20, 8) NOT NULL DEFAULT 0,
  ADD COLUMN refund_amount numeric(20, 8);

ALTER TABLE job_escrows
  DROP CONSTRAINT job_escrows_fee_on_paid;

ALTER TABLE job_escrows
  ADD CONSTRAINT job_escrows_fee_on_paid CHECK (
    state <> 'paid'
    OR (
      fee_amount IS NOT NULL
      AND net_to_winner IS NOT NULL
      AND fee_amount + net_to_winner + carved_out_amount = amount
    )
  );

ALTER TABLE job_escrows
  ADD CONSTRAINT job_escrows_carved_nonneg CHECK (
    carved_out_amount >= 0 AND carved_out_amount <= amount
  );
