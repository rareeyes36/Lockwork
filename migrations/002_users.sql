CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle        citext NOT NULL,
  email         citext,
  display_name  text NOT NULL,
  wallet_address text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_handle_unique UNIQUE (handle),
  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE INDEX users_wallet_address_idx ON users (wallet_address)
  WHERE wallet_address IS NOT NULL;
