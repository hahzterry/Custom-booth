-- MyBishBash ONE_EVENT paid-access schema repair.
-- Intended for testing against a disposable database first.
-- Do not apply directly to production without validation.

DROP TRIGGER IF EXISTS purchases_founding_limit;
DROP TRIGGER IF EXISTS purchases_founding_requires_reservation;

DROP TABLE entitlements;
DROP TABLE purchases;

CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  stripe_checkout_session_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_price_id TEXT,
  plan TEXT NOT NULL CHECK (plan IN (
    'ONE_EVENT',
    'PERSONAL_6_MONTH',
    'PERSONAL_12_MONTH',
    'FOUNDING_LIFETIME'
  )),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paid', 'refunded', 'disputed')),
  last_stripe_event_created INTEGER NOT NULL,
  paid_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE entitlements (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  purchase_id TEXT NOT NULL UNIQUE REFERENCES purchases(id),
  plan TEXT NOT NULL CHECK (plan IN (
    'ONE_EVENT',
    'PERSONAL_6_MONTH',
    'PERSONAL_12_MONTH',
    'FOUNDING_LIFETIME'
  )),
  starts_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (
    (plan = 'FOUNDING_LIFETIME' AND expires_at IS NULL) OR
    (plan != 'FOUNDING_LIFETIME' AND expires_at IS NOT NULL)
  )
);

CREATE INDEX purchases_customer_idx
  ON purchases(customer_id, status);

CREATE INDEX purchases_founding_count_idx
  ON purchases(plan, status);

CREATE INDEX entitlements_active_customer_idx
  ON entitlements(customer_id, revoked_at, expires_at);

CREATE TRIGGER purchases_founding_limit
BEFORE INSERT ON purchases
WHEN NEW.plan = 'FOUNDING_LIFETIME'
  AND NOT EXISTS (
    SELECT 1 FROM purchases p
    WHERE p.stripe_checkout_session_id = NEW.stripe_checkout_session_id
  )
  AND (
    SELECT COUNT(*) FROM purchases
    WHERE plan = 'FOUNDING_LIFETIME' AND status = 'paid'
  ) >= 500
BEGIN
  SELECT RAISE(ABORT, 'founding_limit_reached');
END;

CREATE TRIGGER purchases_founding_requires_reservation
BEFORE INSERT ON purchases
WHEN NEW.plan = 'FOUNDING_LIFETIME'
  AND NOT EXISTS (
    SELECT 1 FROM purchases p
    WHERE p.stripe_checkout_session_id = NEW.stripe_checkout_session_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM checkout_requests cr
    JOIN founding_reservations fr ON fr.checkout_request_id = cr.id
    WHERE cr.stripe_checkout_session_id = NEW.stripe_checkout_session_id
      AND fr.stripe_checkout_session_id = NEW.stripe_checkout_session_id
      AND fr.status IN ('checkout_created', 'converted')
  )
BEGIN
  SELECT RAISE(ABORT, 'founding_reservation_required');
END;
