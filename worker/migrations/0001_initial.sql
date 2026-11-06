PRAGMA foreign_keys = ON;

-- Personal billing and entitlement state. No guest photographs belong here.
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE checkout_requests (
  id TEXT PRIMARY KEY,
  idempotency_key_hash TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN (
    'PERSONAL_6_MONTH',
    'PERSONAL_12_MONTH',
    'FOUNDING_LIFETIME'
  )),
  email_normalized TEXT,
  stripe_price_id TEXT NOT NULL,
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_checkout_url TEXT,
  stripe_checkout_expires_at TEXT,
  founding_reservation_id TEXT,
  status TEXT NOT NULL CHECK (status IN (
    'creating',
    'ready',
    'completed',
    'expired',
    'failed'
  )),
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE founding_reservations (
  id TEXT PRIMARY KEY,
  checkout_request_id TEXT NOT NULL UNIQUE REFERENCES checkout_requests(id),
  stripe_checkout_session_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN (
    'reserved',
    'checkout_created',
    'converted',
    'released'
  )),
  reserved_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  converted_at TEXT
);

CREATE INDEX founding_reservations_capacity_idx
  ON founding_reservations(status, expires_at);

CREATE TABLE stripe_webhook_events (
  stripe_event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('received', 'succeeded')),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),
  stripe_created_at TEXT NOT NULL,
  first_received_at TEXT NOT NULL,
  last_received_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  stripe_checkout_session_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_price_id TEXT,
  plan TEXT NOT NULL CHECK (plan IN (
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

CREATE INDEX purchases_customer_idx ON purchases(customer_id, status);
CREATE INDEX purchases_founding_count_idx ON purchases(plan, status);

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

CREATE TRIGGER purchases_founding_limit
BEFORE INSERT ON purchases
WHEN NEW.plan = 'FOUNDING_LIFETIME'
  AND NOT EXISTS (
    SELECT 1 FROM purchases p
     WHERE p.stripe_checkout_session_id = NEW.stripe_checkout_session_id
  )
  AND (
    SELECT COUNT(*)
      FROM purchases
     WHERE plan = 'FOUNDING_LIFETIME' AND status = 'paid'
  ) >= 500
BEGIN
  SELECT RAISE(ABORT, 'founding_limit_reached');
END;

CREATE TABLE entitlements (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  purchase_id TEXT NOT NULL UNIQUE REFERENCES purchases(id),
  plan TEXT NOT NULL CHECK (plan IN (
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

CREATE INDEX entitlements_active_customer_idx
  ON entitlements(customer_id, revoked_at, expires_at);

CREATE TABLE entitlement_restore_tokens (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX entitlement_restore_lookup_idx
  ON entitlement_restore_tokens(token_hash, expires_at, consumed_at);

-- Business control-plane records. A business receives a single-use API key at
-- provisioning time; only its hash is retained.
CREATE TABLE business_organisations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE business_api_keys (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES business_organisations(id),
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX business_api_keys_org_idx
  ON business_api_keys(organisation_id, revoked_at);

CREATE TABLE business_events (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES business_organisations(id),
  public_id TEXT NOT NULL UNIQUE,
  public_access_token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  event_date TEXT,
  brand_name TEXT NOT NULL,
  primary_colour TEXT NOT NULL DEFAULT '#ff4f8b',
  secondary_colour TEXT NOT NULL DEFAULT '#111111',
  welcome_heading TEXT NOT NULL,
  welcome_cta TEXT NOT NULL DEFAULT 'START',
  welcome_hint TEXT NOT NULL DEFAULT 'tap to begin',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'archived')),
  allow_share INTEGER NOT NULL DEFAULT 1 CHECK (allow_share IN (0, 1)),
  allow_download INTEGER NOT NULL DEFAULT 1 CHECK (allow_download IN (0, 1)),
  delivery_mode TEXT NOT NULL DEFAULT 'immediate' CHECK (delivery_mode IN (
    'immediate',
    'email_gate',
    'configured'
  )),
  collect_email INTEGER NOT NULL DEFAULT 0 CHECK (collect_email IN (0, 1)),
  require_email_before_completion INTEGER NOT NULL DEFAULT 0 CHECK (require_email_before_completion IN (0, 1)),
  marketing_consent_enabled INTEGER NOT NULL DEFAULT 0 CHECK (marketing_consent_enabled IN (0, 1)),
  photo_use_consent_enabled INTEGER NOT NULL DEFAULT 0 CHECK (photo_use_consent_enabled IN (0, 1)),
  collect_consented_photos INTEGER NOT NULL DEFAULT 0 CHECK (collect_consented_photos IN (0, 1)),
  marketing_consent_wording TEXT,
  photo_use_consent_wording TEXT,
  consent_wording_version INTEGER NOT NULL DEFAULT 1 CHECK (consent_wording_version > 0),
  white_label INTEGER NOT NULL DEFAULT 0 CHECK (white_label IN (0, 1)),
  active_logo_asset_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (require_email_before_completion = 0 OR collect_email = 1),
  CHECK (marketing_consent_enabled = 0 OR collect_email = 1),
  CHECK (collect_consented_photos = 0 OR photo_use_consent_enabled = 1),
  CHECK (
    marketing_consent_enabled = 0 OR
    COALESCE(LENGTH(TRIM(marketing_consent_wording)), 0) > 0
  ),
  CHECK (
    photo_use_consent_enabled = 0 OR
    COALESCE(LENGTH(TRIM(photo_use_consent_wording)), 0) > 0
  ),
  CHECK (delivery_mode != 'email_gate' OR (
    collect_email = 1 AND require_email_before_completion = 1
  ))
);

CREATE INDEX business_events_org_idx
  ON business_events(organisation_id, status);

CREATE TABLE event_consent_versions (
  event_id TEXT NOT NULL REFERENCES business_events(id),
  version INTEGER NOT NULL CHECK (version > 0),
  marketing_consent_enabled INTEGER NOT NULL CHECK (marketing_consent_enabled IN (0, 1)),
  photo_use_consent_enabled INTEGER NOT NULL CHECK (photo_use_consent_enabled IN (0, 1)),
  marketing_consent_wording TEXT,
  photo_use_consent_wording TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (event_id, version)
);

CREATE TABLE attendees (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES business_events(id),
  guest_session_id TEXT NOT NULL,
  email TEXT,
  email_normalized TEXT,
  email_collected_at TEXT,
  marketing_consent INTEGER CHECK (marketing_consent IN (0, 1) OR marketing_consent IS NULL),
  photo_use_consent INTEGER CHECK (photo_use_consent IN (0, 1) OR photo_use_consent IS NULL),
  consent_wording_version INTEGER,
  marketing_consent_wording TEXT,
  photo_use_consent_wording TEXT,
  consent_timestamp TEXT,
  photo_use_consent_revoked_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (event_id, guest_session_id),
  FOREIGN KEY (event_id, consent_wording_version)
    REFERENCES event_consent_versions(event_id, version),
  CHECK (email IS NOT NULL OR email_normalized IS NULL),
  CHECK (
    marketing_consent IS NULL OR (
      consent_wording_version IS NOT NULL AND
      COALESCE(LENGTH(TRIM(marketing_consent_wording)), 0) > 0 AND
      consent_timestamp IS NOT NULL
    )
  ),
  CHECK (
    photo_use_consent IS NULL OR (
      consent_wording_version IS NOT NULL AND
      COALESCE(LENGTH(TRIM(photo_use_consent_wording)), 0) > 0 AND
      consent_timestamp IS NOT NULL
    )
  )
);

CREATE INDEX attendees_event_idx ON attendees(event_id, created_at);
CREATE INDEX attendees_event_email_idx ON attendees(event_id, email_normalized);
CREATE INDEX attendees_photo_consent_idx
  ON attendees(event_id, photo_use_consent, photo_use_consent_revoked_at);

CREATE TRIGGER attendees_consent_snapshot_guard
BEFORE INSERT ON attendees
WHEN (NEW.marketing_consent IS NOT NULL OR NEW.photo_use_consent IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1
      FROM event_consent_versions v
     WHERE v.event_id = NEW.event_id
       AND v.version = NEW.consent_wording_version
       AND (
         NEW.marketing_consent IS NULL OR (
           v.marketing_consent_enabled = 1 AND
           v.marketing_consent_wording = NEW.marketing_consent_wording
         )
       )
       AND (
         NEW.photo_use_consent IS NULL OR (
           v.photo_use_consent_enabled = 1 AND
           v.photo_use_consent_wording = NEW.photo_use_consent_wording
         )
       )
  )
BEGIN
  SELECT RAISE(ABORT, 'consent_snapshot_mismatch');
END;

-- Upload authorisations are short-lived, one-use, and purpose-bound. They are
-- checked again at upload time; a signed token alone is never sufficient.
CREATE TABLE upload_authorisations (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('brand_asset', 'guest_output')),
  organisation_id TEXT NOT NULL REFERENCES business_organisations(id),
  event_id TEXT NOT NULL REFERENCES business_events(id),
  attendee_id TEXT REFERENCES attendees(id),
  asset_kind TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256_hex TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'authorised' CHECK (state IN (
    'authorised',
    'uploading',
    'stored',
    'failed'
  )),
  claim_id TEXT,
  claim_expires_at TEXT,
  last_error_code TEXT,
  r2_etag TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (
    (purpose = 'brand_asset' AND attendee_id IS NULL) OR
    (purpose = 'guest_output' AND attendee_id IS NOT NULL)
  )
);

CREATE INDEX upload_authorisations_lookup_idx
  ON upload_authorisations(id, purpose, expires_at, used_at);

-- Brand assets and guest outputs remain separate in both D1 and R2.
CREATE TABLE brand_assets (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES business_organisations(id),
  event_id TEXT NOT NULL REFERENCES business_events(id),
  upload_authorisation_id TEXT NOT NULL UNIQUE REFERENCES upload_authorisations(id),
  kind TEXT NOT NULL CHECK (kind IN ('logo')),
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256_hex TEXT NOT NULL,
  r2_etag TEXT NOT NULL,
  finalization_claim_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX brand_assets_event_idx ON brand_assets(event_id, deleted_at);

CREATE TABLE guest_outputs (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES business_organisations(id),
  event_id TEXT NOT NULL REFERENCES business_events(id),
  attendee_id TEXT NOT NULL REFERENCES attendees(id),
  upload_authorisation_id TEXT NOT NULL UNIQUE REFERENCES upload_authorisations(id),
  kind TEXT NOT NULL CHECK (kind IN (
    'strip_png',
    'magazine_png',
    'polaroid_png',
    'polaroid_mp4'
  )),
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/png', 'video/mp4')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256_hex TEXT NOT NULL,
  r2_etag TEXT NOT NULL,
  finalization_claim_id TEXT NOT NULL,
  consent_wording_version INTEGER NOT NULL,
  photo_use_consent_wording TEXT NOT NULL,
  consent_timestamp TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX guest_outputs_event_idx ON guest_outputs(event_id, created_at);
CREATE INDEX guest_outputs_attendee_idx ON guest_outputs(attendee_id, deleted_at);

-- Finalization guards close the gap between issuing an upload token and
-- recording the uploaded object. Configuration, organisation status, and
-- consent are evaluated again inside the D1 transaction.
CREATE TRIGGER brand_assets_active_scope_guard
BEFORE INSERT ON brand_assets
WHEN NOT EXISTS (
  SELECT 1
    FROM business_events e
    JOIN business_organisations o ON o.id = e.organisation_id
    JOIN upload_authorisations ua ON ua.id = NEW.upload_authorisation_id
   WHERE e.id = NEW.event_id
     AND e.organisation_id = NEW.organisation_id
     AND e.status != 'archived'
     AND o.status = 'active'
     AND ua.state = 'uploading'
     AND ua.claim_id = NEW.finalization_claim_id
     AND ua.claim_expires_at > NEW.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'brand_asset_scope_not_active');
END;

CREATE TRIGGER guest_outputs_collection_guard
BEFORE INSERT ON guest_outputs
WHEN NOT EXISTS (
  SELECT 1
    FROM attendees a
    JOIN business_events e ON e.id = a.event_id
    JOIN business_organisations o ON o.id = e.organisation_id
    JOIN upload_authorisations ua ON ua.id = NEW.upload_authorisation_id
   WHERE a.id = NEW.attendee_id
     AND a.event_id = NEW.event_id
     AND e.organisation_id = NEW.organisation_id
     AND e.status = 'live'
     AND o.status = 'active'
     AND e.collect_consented_photos = 1
     AND e.photo_use_consent_enabled = 1
     AND a.photo_use_consent = 1
     AND a.photo_use_consent_revoked_at IS NULL
     AND a.consent_wording_version = NEW.consent_wording_version
     AND a.photo_use_consent_wording = NEW.photo_use_consent_wording
     AND a.consent_timestamp = NEW.consent_timestamp
     AND ua.state = 'uploading'
     AND ua.claim_id = NEW.finalization_claim_id
     AND ua.claim_expires_at > NEW.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'guest_output_collection_not_allowed');
END;
