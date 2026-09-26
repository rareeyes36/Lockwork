-- Real on-chain transactions (Base Sepolia escrow) verified by the server.
-- One row per tx hash: a lock/release/refund tx can back exactly one DB action.

CREATE TABLE chain_txs (
  tx_hash     text PRIMARY KEY,
  chain_id    integer NOT NULL,
  job_id      uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  kind        text NOT NULL,
  block       bigint,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chain_txs_kind_check CHECK (kind IN ('lock', 'release', 'refund'))
);

CREATE INDEX chain_txs_job_id_idx ON chain_txs (job_id);
