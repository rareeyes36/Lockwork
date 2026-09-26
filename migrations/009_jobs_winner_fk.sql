ALTER TABLE jobs
  ADD CONSTRAINT jobs_winner_submission_id_fkey
  FOREIGN KEY (winner_submission_id)
  REFERENCES submissions (id)
  ON DELETE SET NULL;
