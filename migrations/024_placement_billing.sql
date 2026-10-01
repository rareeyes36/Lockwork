-- Backlog #14: sponsor placement fee (500 bps) that sticks on attach/lock.
-- Invoices mirror seat_invoices: custodial_sim mark-paid; Stripe reserved.
-- Amount = contribution.amount * placement_fee_bps / 10000, snapshotted at charge.
-- Does not touch platform_fee_bps (250) / release fee / escrow / wallet.

CREATE TABLE placement_invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id     uuid NOT NULL REFERENCES sponsor_contributions (id) ON DELETE CASCADE,
  workspace_id        uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  job_id              uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  amount              numeric(20, 8) NOT NULL,
  currency            text NOT NULL DEFAULT 'USD',
  placement_fee_bps   integer NOT NULL DEFAULT 500,
  state               text NOT NULL DEFAULT 'open',
  rail                text NOT NULL DEFAULT 'custodial_sim',
  invoice_ref         text,
  paid_at             timestamptz,
  voided_at           timestamptz,
  meta_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT placement_invoices_amount_positive CHECK (amount > 0),
  CONSTRAINT placement_invoices_bps_check CHECK (
    placement_fee_bps >= 0 AND placement_fee_bps <= 10000
  ),
  CONSTRAINT placement_invoices_state_check CHECK (
    state IN ('open', 'paid', 'void')
  ),
  CONSTRAINT placement_invoices_rail_check CHECK (
    rail IN ('custodial_sim', 'stripe')
  ),
  CONSTRAINT placement_invoices_paid_consistency CHECK (
    (state = 'paid' AND paid_at IS NOT NULL)
    OR (state <> 'paid' AND paid_at IS NULL)
  ),
  CONSTRAINT placement_invoices_void_consistency CHECK (
    (state = 'void' AND voided_at IS NOT NULL)
    OR (state <> 'void')
  )
);

CREATE INDEX placement_invoices_contribution_id_idx ON placement_invoices (contribution_id);
CREATE INDEX placement_invoices_workspace_id_idx ON placement_invoices (workspace_id);
CREATE INDEX placement_invoices_job_id_idx ON placement_invoices (job_id);
CREATE INDEX placement_invoices_state_idx ON placement_invoices (state);

-- At most one open invoice per contribution (re-charge after void is fine).
CREATE UNIQUE INDEX placement_invoices_one_open_per_contribution
  ON placement_invoices (contribution_id)
  WHERE state = 'open';

-- At most one paid invoice per contribution (placement fee charged once).
CREATE UNIQUE INDEX placement_invoices_one_paid_per_contribution
  ON placement_invoices (contribution_id)
  WHERE state = 'paid';

COMMENT ON TABLE placement_invoices IS
  'Sponsor placement fee charges (500 bps). custodial_sim = invoice recorded / mark-paid stub; stripe = live processor later. Separate from release fee (250 bps).';
