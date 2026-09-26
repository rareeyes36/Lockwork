-- Dante design direction: recursive / fractal jobs

ALTER TABLE jobs
  ADD COLUMN parent_job_id uuid REFERENCES jobs (id) ON DELETE SET NULL,
  ADD COLUMN budget_source text NOT NULL DEFAULT 'root',
  ADD COLUMN budget_parent_escrow_id uuid REFERENCES job_escrows (id) ON DELETE SET NULL,
  ADD COLUMN root_job_id uuid REFERENCES jobs (id) ON DELETE SET NULL;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_budget_source_check CHECK (
    budget_source IN ('root', 'parent_carveout', 'expansion')
  );

ALTER TABLE jobs
  ADD CONSTRAINT jobs_root_budget_check CHECK (
    (parent_job_id IS NULL AND budget_source = 'root')
    OR
    (parent_job_id IS NOT NULL AND budget_source IN ('parent_carveout', 'expansion'))
  );

CREATE INDEX jobs_parent_job_id_idx ON jobs (parent_job_id);
CREATE INDEX jobs_root_job_id_idx ON jobs (root_job_id);

-- Backfill root_job_id for existing rows
UPDATE jobs SET root_job_id = id WHERE root_job_id IS NULL AND parent_job_id IS NULL;
