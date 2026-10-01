-- Backlog #4: company seat billing that sticks after hire.
-- Invoices are billed to the company (workspace), never a sub-team.
-- Rail defaults to custodial_sim until Stripe is wired; amount is snapshotted
-- at charge time from the app config seat_price_usd ($79).

CREATE TABLE seat_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employment_id   uuid NOT NULL REFERENCES employments (id) ON DELETE CASCADE,
  workspace_id    uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  amount          numeric(20, 8) NOT NULL,
  currency        text NOT NULL DEFAULT 'USD',
  plan            text NOT NULL DEFAULT 'workspace_member',
  state           text NOT NULL DEFAULT 'open',
  rail            text NOT NULL DEFAULT 'custodial_sim',
  invoice_ref     text,
  period_start    timestamptz,
  period_end      timestamptz,
  paid_at         timestamptz,
  voided_at       timestamptz,
  meta_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seat_invoices_amount_positive CHECK (amount > 0),
  CONSTRAINT seat_invoices_state_check CHECK (
    state IN ('open', 'paid', 'void')
  ),
  CONSTRAINT seat_invoices_rail_check CHECK (
    rail IN ('custodial_sim', 'stripe')
  ),
  CONSTRAINT seat_invoices_paid_consistency CHECK (
    (state = 'paid' AND paid_at IS NOT NULL)
    OR (state <> 'paid' AND paid_at IS NULL)
  ),
  CONSTRAINT seat_invoices_void_consistency CHECK (
    (state = 'void' AND voided_at IS NOT NULL)
    OR (state <> 'void')
  )
);

CREATE INDEX seat_invoices_employment_id_idx ON seat_invoices (employment_id);
CREATE INDEX seat_invoices_workspace_id_idx ON seat_invoices (workspace_id);
CREATE INDEX seat_invoices_state_idx ON seat_invoices (state);

-- At most one open invoice per employment (re-charge after void/pay is fine).
CREATE UNIQUE INDEX seat_invoices_one_open_per_employment
  ON seat_invoices (employment_id)
  WHERE state = 'open';

COMMENT ON TABLE seat_invoices IS
  'Company seat charges. custodial_sim = invoice recorded / mark-paid stub; stripe = live processor later.';
