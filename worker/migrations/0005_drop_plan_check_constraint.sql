PRAGMA foreign_keys=off;

BEGIN TRANSACTION;

-- Rename the existing table to a backup
ALTER TABLE checkout_requests RENAME TO checkout_requests_old;

-- Create a brand new table WITHOUT the strict plan CHECK constraint
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
  founding_reservation_id TEXT,
  status TEXT NOT NULL,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Copy the data from your old table into the new one
INSERT INTO checkout_requests SELECT * FROM checkout_requests_old;

-- Delete the old table
DROP TABLE checkout_requests_old;

COMMIT;

PRAGMA foreign_keys=on;