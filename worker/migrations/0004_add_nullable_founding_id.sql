-- Remove NOT NULL constraint from founding_reservation_id
PRAGMA foreign_keys=off;

BEGIN TRANSACTION;

ALTER TABLE checkout_requests RENAME TO checkout_requests_old;

CREATE TABLE checkout_requests (
  id TEXT PRIMARY KEY NOT NULL,
  idempotency_key_hash TEXT UNIQUE NOT NULL,
  request_fingerprint TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL,
  email_normalized TEXT,
  stripe_price_id TEXT NOT NULL,
  stripe_checkout_session_id TEXT,
  stripe_checkout_url TEXT,
  stripe_checkout_expires_at TEXT,
  founding_reservation_id TEXT,  -- 👈 NOT NULL removed here
  status TEXT NOT NULL,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO checkout_requests SELECT * FROM checkout_requests_old;

DROP TABLE checkout_requests_old;

COMMIT;

PRAGMA foreign_keys=on;