-- Genius #5 (user pick E): reputation facts now; escrow tier gates later

CREATE TABLE worker_reputation (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_type     text NOT NULL,
  user_id            uuid REFERENCES users (id) ON DELETE CASCADE,
  bot_agent_id       uuid REFERENCES bot_agents (id) ON DELETE CASCADE,
  wins_count         integer NOT NULL DEFAULT 0,
  employment_days    integer NOT NULL DEFAULT 0,
  escrow_tier        text NOT NULL DEFAULT 'open',
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worker_reputation_principal_type_check CHECK (
    principal_type IN ('user', 'bot')
  ),
  CONSTRAINT worker_reputation_principal_check CHECK (
    (principal_type = 'user' AND user_id IS NOT NULL AND bot_agent_id IS NULL)
    OR (principal_type = 'bot' AND bot_agent_id IS NOT NULL AND user_id IS NULL)
  ),
  CONSTRAINT worker_reputation_tier_check CHECK (
    escrow_tier IN ('open', 'mid', 'high')
  ),
  CONSTRAINT worker_reputation_wins_nonneg CHECK (wins_count >= 0),
  CONSTRAINT worker_reputation_days_nonneg CHECK (employment_days >= 0)
);

CREATE UNIQUE INDEX worker_reputation_user_uidx
  ON worker_reputation (user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX worker_reputation_bot_uidx
  ON worker_reputation (bot_agent_id)
  WHERE bot_agent_id IS NOT NULL;

CREATE INDEX worker_reputation_escrow_tier_idx
  ON worker_reputation (escrow_tier);
