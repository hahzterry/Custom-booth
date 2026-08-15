# LUMEE BOOTH Photobooth API

This directory is a deliberately small Cloudflare Worker control plane for the
existing local-first photobooth. It does **not** replace or move the capture,
render, export, IndexedDB gallery, or offline engine.

The Worker stores only state that genuinely needs a server:

- verified Stripe purchases and Personal entitlements;
- the real Founding Lifetime purchase count;
- Business organisations, events, feature configuration, and branding metadata;
- separately recorded email, marketing-consent, and photo-publicity decisions;
- Business logo metadata; and
- rendered Business outputs only when collection is enabled and the attendee has
  affirmatively granted the current photo-use permission.

Free and Personal photographs have no upload endpoint. Business brand artwork and
consented guest outputs use different D1 tables **and different R2 bindings**.

## Privacy invariants

These rules are enforced on the server and in the schema, not left to the UI:

1. `FREE` and all Personal plans have no media-upload capability.
2. A Business event starts with email collection, consent capture, and photo
   collection off.
3. Marketing consent is nullable and separate from providing an email address.
4. Photo-publicity consent is nullable and separate from taking part in the booth.
5. Consent wording, version, and timestamp are copied into each attendee record.
6. `collectConsentedPhotos` cannot be enabled unless photo-use consent is enabled.
7. A guest-output authorisation requires event collection to be on and a matching,
   affirmative, unrevoked attendee decision.
8. The same rule is checked again during `PUT`; revoking consent makes an already
   issued upload token unusable.
9. The API accepts only the four renderer-labelled PNG/MP4 container kinds and has
   no generic raw-camera route. MIME, size, checksum, and magic bytes are enforced;
   this boundary does not cryptographically prove renderer provenance.
10. Logo uploads currently accept PNG and JPEG only. SVG remains rejected until a
    dedicated sanitizer/rasterization path exists.

## Local setup

Requirements: Node 20+ and a Cloudflare account for remote bindings.

```sh
cd worker
npm install
cp wrangler.example.toml wrangler.toml
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm test
npm run typecheck
npm run dev
```

`wrangler.toml`, `.dev.vars`, local databases, and dependencies are ignored. Never
commit real IDs or secrets.

Create production secrets with Wrangler rather than placing them in config:

```sh
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put TOKEN_SIGNING_SECRET
wrangler secret put PLATFORM_ADMIN_BEARER_TOKEN
```

`TOKEN_SIGNING_SECRET` and `PLATFORM_ADMIN_BEARER_TOKEN` should each be at least 32
random bytes. Use distinct values. Known example/sentinel values are rejected even
when they meet the length check.

Required bindings and variables:

| Name | Purpose |
|---|---|
| `DB` | D1 structured state |
| `BRAND_ASSETS` | private R2 bucket for Business logos |
| `CONSENTED_GUEST_OUTPUTS` | private R2 bucket for explicitly consented Business outputs |
| `ENTITLEMENT_EMAIL_QUEUE` | restore-link jobs for a separate mail worker |
| `CHECKOUT_RATE_LIMITER` | anonymous Checkout/restore throttling |
| `PUBLIC_API_RATE_LIMITER` | event-session/attendee/upload-authorisation throttling |
| `PUBLIC_APP_ORIGIN` | fixed Checkout return origin; HTTPS outside localhost |
| `ALLOWED_ORIGINS` | comma-separated exact browser origins |
| `STRIPE_PRICE_PERSONAL_6_MONTH` | Stripe Price for £30 one-time payment |
| `STRIPE_PRICE_PERSONAL_12_MONTH` | Stripe Price for £50 one-time payment |
| `STRIPE_PRICE_FOUNDING_LIFETIME` | Stripe Price for £100 one-time payment |
| `STRIPE_EXPECTED_LIVEMODE` | `false` in test; deliberately switch to `true` in production |

The Worker accepts only the literal strings `true` or `false`, refuses `false` when
`ENVIRONMENT=production`, and verifies that the Stripe key prefix matches the chosen
mode.

Apply production migrations explicitly:

```sh
npm run db:migrate:remote
```

## Entitlements and Checkout

Plans are semantic identifiers; pricing text never controls behaviour:

- `FREE`
- `PERSONAL_6_MONTH`
- `PERSONAL_12_MONTH`
- `FOUNDING_LIFETIME`
- `BUSINESS`

The API derives named capabilities such as `canPersonaliseEvent`,
`canUploadBusinessLogo`, `canCollectConsent`, and
`canCollectConsentedPhotos` from the plan.

### Create Checkout

`POST /v1/billing/checkout`

```json
{
  "plan": "PERSONAL_6_MONTH",
  "email": "optional@example.com"
}
```

Send an `Idempotency-Key` header (8–128 safe ASCII characters). A successful
response contains `checkoutUrl`. Redirect the browser there.
The key is unique independently of request parameters: reusing it with a different
plan/email is rejected, while an interrupted in-progress request retries the same
server-side Stripe idempotency key.

The success URL is only navigation. It never grants an entitlement. The Worker
checks that each configured Stripe Price is an active, one-time GBP Price at the
published amount before creating Checkout. It then requires a valid Stripe
signature, a paid Checkout Session, expected live/test
mode, exact GBP amount, expected internal Checkout reference, and an atomic D1
fulfilment transaction.

Configure Stripe to send these events to `POST /v1/webhooks/stripe`:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed` (releases an unsuccessful founding reservation)
- `checkout.session.expired` (releases an unused founding reservation)
- `charge.refunded` (a full refund revokes its entitlement)
- `charge.dispute.created` (suspends its entitlement)
- `charge.dispute.closed` (restores a won dispute; keeps a lost dispute revoked)

The handler uses the raw request body and accepts signed events within a five-minute
window. Stripe event IDs and Checkout Session IDs are unique; replaying a delivery
does not duplicate purchases or entitlements.

### Founding Lifetime availability

`GET /v1/billing/founding`

```json
{
  "limit": 500,
  "successfulPurchases": 12,
  "remaining": 488,
  "soldOut": false,
  "label": "Limited to 500 Founding Lifetime memberships"
}
```

The visible count comes only from successful, paid qualifying purchase rows. Short
Checkout reservations help prevent overselling but are never presented as customers.
A D1 trigger is the final hard guard at 500.

### Restore Personal access

`POST /v1/entitlements/restore/request` with `{ "email": "…" }` always returns the
same `202` response, whether an entitlement exists or not. When one exists, a
single-use 15-minute token is sent to `ENTITLEMENT_EMAIL_QUEUE`:

```json
{
  "type": "mybishbash.photobooth.entitlement_restore",
  "to": "customer@example.com",
  "token": "mbb_restore_…",
  "verifyUrl": "https://mybishbash.app/photobooth/restore",
  "expiresAt": "2026-08-09T13:00:00.000Z"
}
```

A separate mail worker should render and deliver that link. It owns email-provider
credentials; this API does not.

`POST /v1/entitlements/restore/verify` with `{ "token": "mbb_restore_…" }` consumes
the token once and returns a 30-day signed access token. Clients restore current
server state with `GET /v1/entitlements/current` and
`Authorization: Bearer <accessToken>`. The access token identifies the customer;
the plan is re-read from D1 so expiry or revocation cannot be bypassed by stale
client claims. Without authorization, the endpoint returns `FREE`.

## Business lifecycle

Business customers are provisioned after a commercial agreement. There is no public
self-serve Business price or heavyweight account dashboard in this Worker.

1. A protected platform call creates an organisation:
   `POST /v1/admin/business/organisations`.
2. The response shows one `mbb_bus_…` key once; D1 stores only its SHA-256 hash.
3. That key creates and manages `/v1/business/events`.
4. Event creation returns a separate `mbb_evt_…` booth credential and public ID.
5. A live booth uses that event credential to read public configuration and create
   short-lived guest-session tokens.

The main organiser routes are:

| Method and route | Access | Purpose |
|---|---|---|
| `POST /v1/admin/business/organisations` | platform | provision organisation and one-time API key |
| `GET /v1/business/events` | Business | list owned events |
| `POST /v1/business/events` | Business | create event with privacy-safe defaults |
| `GET/PATCH /v1/business/events/:eventId` | Business | read or update branding/flow/consent config |
| `GET /v1/business/events/:eventId/attendees.csv` | Business | injection-safe attendee/consent export |
| `POST /v1/business/events/:eventId/attendees/:attendeeId/revoke-photo-consent` | Business | block future collection immediately |
| `POST /v1/business/events/:eventId/brand-assets/upload-authorisations` | Business | one-use logo upload boundary |
| `POST /v1/business/events/:eventId/rotate-event-token` | Business | invalidate and replace the booth credential |

Supported event switches are independent:

```json
{
  "allowShare": true,
  "allowDownload": true,
  "deliveryMode": "immediate",
  "collectEmail": false,
  "requireEmailBeforeCompletion": false,
  "marketingConsentEnabled": false,
  "photoUseConsentEnabled": false,
  "collectConsentedPhotos": false,
  "marketingConsentWording": "Configurable wording",
  "photoUseConsentWording": "Configurable wording"
}
```

The server rejects contradictory combinations. Consent wording changes automatically
create a new immutable version.

### Guest event calls

Read the event and start a session with the event credential in
`X-MyBishBash-Event-Token`:

- `GET /v1/public/events/:publicId`
- `POST /v1/public/events/:publicId/sessions`
- `GET /v1/public/events/:publicId/logo`

The session response contains a short-lived bearer token. Use it, plus the event
credential, for:

- `POST /v1/public/events/:publicId/attendees`
- `POST /v1/public/events/:publicId/guest-output-upload-authorisations`

When a consent option is shown, the attendee call requires an explicit boolean even
for decline, plus the exact `consentWordingVersion`. Providing an email never sets
marketing consent, and participating never sets photo-use consent.

## Upload protocol

Upload-authorisation requests contain:

```json
{
  "kind": "logo",
  "fileName": "brand.png",
  "contentType": "image/png",
  "sizeBytes": 12345,
  "sha256": "64-lowercase-hex-characters"
}
```

The response returns a ten-minute, purpose-bound, one-use `PUT` URL and bearer token.
The `PUT` must match the declared Content-Type, length, SHA-256 digest, and file magic
bytes. Object keys are generated server-side; filenames never control an R2 path.

Brand files allow PNG/JPEG up to 2 MiB. Guest outputs allow PNG/MP4 up to 20 MiB and
only the four renderer output kinds. Buckets should remain private; the Worker proxies
the active event logo. It intentionally exposes no general guest-output download
route.

Server-side quotas cap one attendee at 12 outputs/120 MiB and one event at 5,000
outputs/5 GiB, counting unexpired authorisations as well as completed uploads. The
example config also makes both rate-limit bindings mandatory. These controls limit
damage; they do not prove that a public kiosk request came from a real camera capture.
The scheduled handler reconciles stale upload claims every 15 minutes and removes any
R2 object that never reached an authorised D1 finalization.

## Before production traffic

- Connect the separate restore-email queue consumer and test delivery end to end.
- Configure Stripe webhook version `2026-02-25.clover`, test-mode Prices, and then
  separately reviewed live-mode Prices.
- Add account-level WAF/bot controls and alerts around the mandatory Worker rate
  limits. Do not expose live Founding reservations or Business storage before this
  deployment-layer protection is tested.
- Define retention and deletion periods for attendee data and consented outputs.
- Have each organisation review its exact marketing and publicity wording.
- Exercise the refund/dispute policy and customer communications in Stripe test mode.
- Exercise D1 backups, R2 lifecycle rules, key rotation, and incident recovery.

The schema and APIs are an integration boundary, not permission to silently begin
collecting data. Business photo collection remains off until the organiser chooses it,
and no UI should pre-tick either consent choice.
