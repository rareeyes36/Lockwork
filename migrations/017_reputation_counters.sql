-- Genius #5: wire reputation counters on job paid + employment churn
-- v1: maintain wins_count + employment_days; escrow_tier stays default 'open'

ALTER TABLE employments
  ADD COLUMN IF NOT EXISTS ended_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employments_ended_after_start'
  ) THEN
    ALTER TABLE employments
      ADD CONSTRAINT employments_ended_after_start CHECK (
        ended_at IS NULL OR ended_at >= started_at
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION ensure_user_reputation(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM worker_reputation WHERE user_id = p_user_id
  ) THEN
    INSERT INTO worker_reputation (principal_type, user_id)
    VALUES ('user', p_user_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION ensure_bot_reputation(p_bot_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM worker_reputation WHERE bot_agent_id = p_bot_id
  ) THEN
    INSERT INTO worker_reputation (principal_type, bot_agent_id)
    VALUES ('bot', p_bot_id);
  END IF;
END;
$$;

-- On jobs.status → paid: increment winner wins_count from winner submission
CREATE OR REPLACE FUNCTION trg_jobs_paid_reputation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_type text;
  v_user uuid;
  v_bot uuid;
BEGIN
  IF NEW.status = 'paid'
     AND (OLD.status IS DISTINCT FROM 'paid')
     AND NEW.winner_submission_id IS NOT NULL THEN
    SELECT submitter_type, submitter_user_id, submitter_bot_id
      INTO v_type, v_user, v_bot
      FROM submissions
     WHERE id = NEW.winner_submission_id;

    IF v_type = 'user' AND v_user IS NOT NULL THEN
      PERFORM ensure_user_reputation(v_user);
      UPDATE worker_reputation
         SET wins_count = wins_count + 1,
             updated_at = now()
       WHERE user_id = v_user;
    ELSIF v_type = 'bot' AND v_bot IS NOT NULL THEN
      PERFORM ensure_bot_reputation(v_bot);
      UPDATE worker_reputation
         SET wins_count = wins_count + 1,
             updated_at = now()
       WHERE bot_agent_id = v_bot;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_paid_reputation ON jobs;
CREATE TRIGGER jobs_paid_reputation
  AFTER UPDATE OF status, winner_submission_id ON jobs
  FOR EACH ROW
  EXECUTE PROCEDURE trg_jobs_paid_reputation();

-- On employment insert: ensure reputation row for employee
CREATE OR REPLACE FUNCTION trg_employment_insert_reputation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM ensure_user_reputation(NEW.employee_user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employment_insert_reputation ON employments;
CREATE TRIGGER employment_insert_reputation
  AFTER INSERT ON employments
  FOR EACH ROW
  EXECUTE PROCEDURE trg_employment_insert_reputation();

-- On seat churn: add retention days, set ended_at
CREATE OR REPLACE FUNCTION trg_employment_churn_reputation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  days_add integer;
  t0 timestamptz;
  t1 timestamptz;
BEGIN
  IF NEW.seat_status = 'churned'
     AND (OLD.seat_status IS DISTINCT FROM 'churned') THEN
    t0 := COALESCE(NEW.seat_started_at, NEW.started_at);
    t1 := COALESCE(NEW.ended_at, now());
    IF NEW.ended_at IS NULL THEN
      NEW.ended_at := t1;
    END IF;
    days_add := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (t1 - t0)) / 86400)::integer);

    PERFORM ensure_user_reputation(NEW.employee_user_id);
    UPDATE worker_reputation
       SET employment_days = employment_days + days_add,
           updated_at = now()
     WHERE user_id = NEW.employee_user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employment_churn_reputation ON employments;
CREATE TRIGGER employment_churn_reputation
  BEFORE UPDATE OF seat_status, ended_at, seat_started_at ON employments
  FOR EACH ROW
  EXECUTE PROCEDURE trg_employment_churn_reputation();
