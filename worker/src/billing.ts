import type {
  D1PreparedStatement,
  ExecutionContext,
} from "@cloudflare/workers-types";
import { requireBusiness, requirePersonalAccess } from "./auth";
import {
  hmacSha256,
  randomToken,
  sha256Hex,
  signClaims,
  timingSafeEqual,
} from "./crypto";
import {
  ApiError,
  bearerToken,
  json,
  normaliseEmail,
  readJson,
  readTextBounded,
  requireString,
} from "./http";
import {
  addPlanDuration,
  capabilitiesForPlan,
  FOUNDING_LIFETIME_LIMIT,
  isPersonalPlan,
  isUnsafeSecret,
  PERSONAL_PLANS,
} from "./policy";
import type {
  EntitlementPlan,
  Env,
  PersonalAccessClaims,
  PersonalPlan,
} from "./types";

const STRIPE_API_VERSION = "2026-02-25.clover";
const SIGNATURE_TOLERANCE_SECONDS = 300;

const ACTIVE_CHECKOUT_PLANS = [
  "ONE_EVENT",
  "PERSONAL_12_MONTH",
] as const;

type ActiveCheckoutPlan =
  (typeof ACTIVE_CHECKOUT_PLANS)[number];

function isActiveCheckoutPlan(
  value: unknown,
): value is ActiveCheckoutPlan {
  return (
    typeof value === "string" &&
    ACTIVE_CHECKOUT_PLANS.some((plan) => plan === value)
  );
}

/*
 * Canonical catalogue.
 *
 * These prices must match product.js and Stripe.
 * Business remains contact-sales only.
 * Legacy entitlements remain recognizable.
 */
const CATALOGUE: Record<
  ActiveCheckoutPlan,
  { amountMinor: number; currency: "usd" }
> = {
  ONE_EVENT: {
    amountMinor: 4400,
    currency: "usd",
  },
  PERSONAL_12_MONTH: {
    amountMinor: 22200,
    currency: "usd",
  },
};

interface CheckoutRequestBody {
  plan?: unknown;
  email?: unknown;
}

interface StripeCheckoutSession {
  id: string;
  object: "checkout.session";
  url?: string | null;
  mode?: string;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
  customer?: string | null;
  customer_details?: {
    email?: string | null;
  } | null;
  payment_intent?: string | null;
  metadata?: Record<string, string> | null;
  livemode?: boolean;
  client_reference_id?: string | null;
  expires_at?: number | null;
}

interface StripeCharge {
  id: string;
  object: "charge";
  payment_intent?: string | null;
  refunded?: boolean;
  amount_refunded?: number;
  amount?: number;
  status?: string;
}

interface StripeDispute {
  id: string;
  object: "dispute";
  payment_intent?: string | null;
  charge?: string | null;
  status?: string;
}

type StripeObject =
  | StripeCheckoutSession
  | StripeCharge
  | StripeDispute;

interface StripeEvent {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  data: {
    object: StripeObject;
  };
}

interface StripePrice {
  id: string;
  object: "price";
  active: boolean;
  currency: string;
  type: "one_time" | "recurring";
  unit_amount: number | null;
}

interface CheckoutRecord {
  id: string;
  request_fingerprint: string;
  plan: string;
  stripe_price_id: string;
  stripe_checkout_session_id: string | null;
  stripe_checkout_url: string | null;
  stripe_checkout_expires_at: string | null;
  founding_reservation_id: string | null;
  status:
    | "creating"
    | "ready"
    | "completed"
    | "expired"
    | "failed";
  last_error_code: string | null;
  updated_at: string;
}

interface EntitlementRow {
  plan: PersonalPlan;
  starts_at: string;
  expires_at: string | null;
}

function expectedStripeLiveMode(env: Env): boolean {
  if (env.STRIPE_EXPECTED_LIVEMODE === "true") {
    return true;
  }

  if (env.STRIPE_EXPECTED_LIVEMODE === "false") {
    if (env.ENVIRONMENT === "production") {
      throw new ApiError(
        503,
        "stripe_mode_not_configured",
        "Production must use Stripe live mode.",
      );
    }
    return false;
  }

  throw new ApiError(
    503,
    "stripe_mode_not_configured",
    "STRIPE_EXPECTED_LIVEMODE must be true or false.",
  );
}

function requireConfiguredSecret(
  value: string,
  name: string,
): void {
  if (
    !value ||
    value.includes("replace_me") ||
    value.length < 16
  ) {
    throw new ApiError(
      503,
      "service_not_configured",
      `${name} is not configured.`,
    );
  }
}

function validateStripeKeyMode(
  env: Env,
  liveMode: boolean,
): void {
  const prefixes = liveMode
    ? ["sk_live_", "rk_live_"]
    : ["sk_test_", "rk_test_"];

  if (
    isUnsafeSecret(env.STRIPE_SECRET_KEY) ||
    !prefixes.some((prefix) =>
      env.STRIPE_SECRET_KEY.startsWith(prefix)
    )
  ) {
    throw new ApiError(
      503,
      "stripe_mode_not_configured",
      "Stripe key does not match the configured mode.",
    );
  }
}

function appOrigin(env: Env): string {
  let url: URL;

  try {
    url = new URL(env.PUBLIC_APP_ORIGIN);
  } catch {
    throw new ApiError(
      503,
      "app_origin_not_configured",
      "Application origin is not configured.",
    );
  }

  const local =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1";

  if (
    url.protocol !== "https:" &&
    !(local && url.protocol === "http:")
  ) {
    throw new ApiError(
      503,
      "app_origin_not_secure",
      "Application origin must use HTTPS.",
    );
  }

  return url.origin;
}

async function stripeRequest<T>(
  env: Env,
  path: string,
  options: {
    method: "POST" | "GET";
    body?: URLSearchParams;
    idempotencyKey?: string;
  },
): Promise<T> {
  const headers = new Headers({
    authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "stripe-version": STRIPE_API_VERSION,
  });

  if (options.body) {
    headers.set(
      "content-type",
      "application/x-www-form-urlencoded",
    );
  }

  if (options.idempotencyKey) {
    headers.set(
      "idempotency-key",
      options.idempotencyKey,
    );
  }

  const response = await fetch(
    `https://api.stripe.com${path}`,
    {
      method: options.method,
      headers,
      body: options.body?.toString(),
    },
  );

  const data = (await response.json()) as {
    error?: { message?: string };
  } & T;

  if (!response.ok) {
    console.error("stripe_request_failed", {
      status: response.status,
      path,
    });

    throw new ApiError(
      502,
      "stripe_unavailable",
      "Stripe Checkout is temporarily unavailable.",
    );
  }

  return data;
}

function stripePriceId(
  env: Env,
  plan: ActiveCheckoutPlan,
): string {
  const priceId =
    plan === "ONE_EVENT"
      ? env.STRIPE_PRICE_ONE_EVENT
      : env.STRIPE_PRICE_PERSONAL_12_MONTH;

  if (
    !priceId ||
    !/^price_[A-Za-z0-9]+$/.test(priceId)
  ) {
    throw new ApiError(
      503,
      "billing_not_configured",
      "The Stripe price is not configured.",
    );
  }

  return priceId;
}

async function validateStripePrice(
  env: Env,
  priceId: string,
  plan: ActiveCheckoutPlan,
): Promise<void> {
  const expected = CATALOGUE[plan];

  const price = await stripeRequest<StripePrice>(
    env,
    `/v1/prices/${encodeURIComponent(priceId)}`,
    { method: "GET" },
  );

  if (
    price.id !== priceId ||
    price.object !== "price" ||
    price.active !== true ||
    price.type !== "one_time" ||
    price.currency?.toLowerCase() !==
      expected.currency ||
    price.unit_amount !== expected.amountMinor
  ) {
    console.error("stripe_price_misconfigured", {
      plan,
      priceId,
      expectedAmount: expected.amountMinor,
      actualAmount: price.unit_amount,
    });

    throw new ApiError(
      503,
      "billing_not_configured",
      "Stripe price does not match the published package.",
    );
  }
}

function checkoutRecordResponse(
  record: CheckoutRecord,
): Response {
  if (record.status === "completed") {
    throw new ApiError(
      409,
      "checkout_completed",
      "Purchase completed. Restore your access instead.",
    );
  }

  if (record.status === "expired") {
    throw new ApiError(
      410,
      "checkout_expired",
      "Checkout expired. Start again.",
    );
  }

  if (record.status === "failed") {
    throw new ApiError(
      409,
      record.last_error_code ?? "checkout_failed",
      "Checkout failed. Start a new request.",
    );
  }

  if (
    !record.stripe_checkout_session_id ||
    !record.stripe_checkout_url
  ) {
    throw new ApiError(
      409,
      "checkout_in_progress",
      "Checkout is being prepared. Retry shortly.",
    );
  }

  return json({
    checkoutSessionId:
      record.stripe_checkout_session_id,
    checkoutUrl: record.stripe_checkout_url,
    plan: record.plan,
    entitlementPending: true,
    idempotentReplay: true,
  });
}

/*
 * Create a Stripe Checkout Session.
 *
 * Only One Party and Annual are sold online.
 * The Stripe webhook, never the redirect, grants access.
 */
export async function createCheckout(
  request: Request,
  env: Env,
): Promise<Response> {
  requireConfiguredSecret(
    env.STRIPE_SECRET_KEY,
    "STRIPE_SECRET_KEY",
  );

  validateStripeKeyMode(
    env,
    expectedStripeLiveMode(env),
  );

  const body = await readJson<CheckoutRequestBody>(
    request,
  );

  if (!isActiveCheckoutPlan(body.plan)) {
    throw new ApiError(
      400,
      "invalid_plan",
      "Choose One Party or Annual.",
    );
  }

  const plan = body.plan;

  const email =
    body.email === undefined
      ? null
      : normaliseEmail(body.email);

  const key =
    request.headers.get("idempotency-key") ??
    randomToken("auto_", 18);

  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
    throw new ApiError(
      400,
      "invalid_idempotency_key",
      "Invalid Idempotency-Key.",
    );
  }

  const keyHash = await sha256Hex(key);
  const fingerprint = await sha256Hex(
    `${plan}\n${email?.normalized ?? ""}`,
  );

  const existing = await env.DB.prepare(
    `SELECT id, request_fingerprint, plan,
            stripe_price_id,
            stripe_checkout_session_id,
            stripe_checkout_url,
            stripe_checkout_expires_at,
            founding_reservation_id,
            status, last_error_code, updated_at
       FROM checkout_requests
      WHERE idempotency_key_hash = ?1`,
  )
    .bind(keyHash)
    .first<CheckoutRecord>();

  if (
    existing &&
    existing.request_fingerprint !== fingerprint
  ) {
    throw new ApiError(
      409,
      "idempotency_key_reused",
      "This key belongs to another checkout request.",
    );
  }

  if (
    existing?.status === "ready" ||
    existing?.status === "completed" ||
    existing?.status === "expired" ||
    existing?.status === "failed"
  ) {
    return checkoutRecordResponse(existing);
  }

  if (
    existing?.status === "creating" &&
    Date.now() - Date.parse(existing.updated_at) <
      5000
  ) {
    throw new ApiError(
      409,
      "checkout_in_progress",
      "Checkout is still being prepared.",
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const requestId =
    existing?.id ?? crypto.randomUUID();
  const priceId =
    existing?.stripe_price_id ??
    stripePriceId(env, plan);

  if (!existing) {
    await validateStripePrice(env, priceId, plan);

    await env.DB.prepare(
      `INSERT INTO checkout_requests (
         id, idempotency_key_hash,
         request_fingerprint, plan,
         email_normalized, stripe_price_id,
         stripe_checkout_session_id,
         stripe_checkout_url,
         stripe_checkout_expires_at,
         founding_reservation_id,
         status, last_error_code,
         created_at, updated_at
       ) VALUES (
         ?1, ?2, ?3, ?4, ?5, ?6,
         NULL, NULL, NULL, NULL,
         'creating', NULL, ?7, ?7
       )`,
    )
      .bind(
        requestId,
        keyHash,
        fingerprint,
        plan,
        email?.normalized ?? null,
        priceId,
        nowIso,
      )
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE checkout_requests
          SET updated_at = ?1,
              last_error_code = NULL
        WHERE id = ?2
          AND status = 'creating'`,
    )
      .bind(nowIso, requestId)
      .run();
  }

  const expiresAt = new Date(
    now.getTime() + 31 * 60 * 1000,
  );

  const form = new URLSearchParams();

  form.set("mode", "payment");
  form.set("line_items[0][price]", priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("client_reference_id", requestId);
  form.set("customer_creation", "always");

  form.set(
    "success_url",
    `${appOrigin(env)}/photobooth?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
  );

  form.set(
    "cancel_url",
    `${appOrigin(env)}/photobooth?checkout=cancelled`,
  );

  form.set("metadata[mybishbash_plan]", plan);
  form.set(
    "metadata[checkout_request_id]",
    requestId,
  );

  form.set(
    "payment_intent_data[metadata][mybishbash_plan]",
    plan,
  );

  form.set(
    "payment_intent_data[metadata][checkout_request_id]",
    requestId,
  );

  form.set(
    "expires_at",
    String(Math.floor(expiresAt.getTime() / 1000)),
  );

  if (email) {
    form.set("customer_email", email.email);
  }

  let session: StripeCheckoutSession;

  try {
    session = await stripeRequest<StripeCheckoutSession>(
      env,
      "/v1/checkout/sessions",
      {
        method: "POST",
        body: form,
        idempotencyKey:
          `mybishbash-checkout-${requestId}`,
      },
    );
  } catch (error) {
    await env.DB.prepare(
      `UPDATE checkout_requests
          SET last_error_code = 'stripe_request_failed',
              updated_at = ?1
        WHERE id = ?2 AND status = 'creating'`,
    )
      .bind(new Date().toISOString(), requestId)
      .run();

    throw error;
  }

  if (!session.id || !session.url) {
    throw new ApiError(
      502,
      "invalid_stripe_response",
      "Stripe did not return a Checkout URL.",
    );
  }

  await env.DB.prepare(
    `UPDATE checkout_requests
        SET stripe_checkout_session_id = ?1,
            stripe_checkout_url = ?2,
            stripe_checkout_expires_at = ?3,
            status = 'ready',
            last_error_code = NULL,
            updated_at = ?4
      WHERE id = ?5 AND status = 'creating'`,
  )
    .bind(
      session.id,
      session.url,
      new Date(
        (session.expires_at ??
          Math.floor(expiresAt.getTime() / 1000)) *
          1000,
      ).toISOString(),
      new Date().toISOString(),
      requestId,
    )
    .run();

  return json(
    {
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
      plan,
      entitlementPending: true,
      note:
        "Access is granted only after a verified Stripe webhook.",
    },
    201,
  );
}

/*
 * Stripe signature verification.
 */
export async function verifyStripeSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<void> {
  if (!signatureHeader) {
    throw new ApiError(
      400,
      "missing_stripe_signature",
      "Stripe-Signature is required.",
    );
  }

  const parts = signatureHeader
    .split(",")
    .map((part) => part.trim().split("=", 2));

  const timestampText = parts.find(
    ([key]) => key === "t",
  )?.[1];

  const signatures = parts
    .filter(([key]) => key === "v1")
    .map(([, value]) => value ?? "");

  const timestamp = Number(timestampText);

  if (
    !Number.isInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) >
      SIGNATURE_TOLERANCE_SECONDS ||
    signatures.length === 0
  ) {
    throw new ApiError(
      400,
      "invalid_stripe_signature",
      "Stripe signature is invalid.",
    );
  }

  const expected = await hmacSha256(
    secret,
    `${timestamp}.${payload}`,
  );

  const valid = signatures.some((candidate) => {
    const supplied = hexToBytes(candidate);

    return (
      supplied !== null &&
      timingSafeEqual(expected, supplied)
    );
  });

  if (!valid) {
    throw new ApiError(
      400,
      "invalid_stripe_signature",
      "Stripe signature is invalid.",
    );
  }
}

function hexToBytes(
  value: string,
): Uint8Array | null {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    return null;
  }

  const bytes = new Uint8Array(
    value.length / 2,
  );

  for (
    let index = 0;
    index < value.length;
    index += 2
  ) {
    bytes[index / 2] = Number.parseInt(
      value.slice(index, index + 2),
      16,
    );
  }

  return bytes;
}

function isCheckoutSession(
  value: StripeObject,
): value is StripeCheckoutSession {
  return value.object === "checkout.session";
}

async function recordWebhookOnly(
  env: Env,
  event: StripeEvent,
): Promise<void> {
  const receivedAt = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO stripe_webhook_events (
       stripe_event_id, event_type, status,
       attempts, stripe_created_at,
       first_received_at, last_received_at,
       processed_at
     ) VALUES (
       ?1, ?2, 'succeeded', 1,
       ?3, ?4, ?4, ?4
     )
     ON CONFLICT(stripe_event_id)
     DO UPDATE SET
       attempts = stripe_webhook_events.attempts + 1,
       last_received_at = excluded.last_received_at`,
  )
    .bind(
      event.id,
      event.type,
      new Date(event.created * 1000).toISOString(),
      receivedAt,
    )
    .run();
}

/*
 * Webhook entry point.
 */
export async function stripeWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  requireConfiguredSecret(
    env.STRIPE_WEBHOOK_SECRET,
    "STRIPE_WEBHOOK_SECRET",
  );

  const liveMode = expectedStripeLiveMode(env);

  const payload = await readTextBounded(
    request,
    1_048_576,
  );

  await verifyStripeSignature(
    payload,
    request.headers.get("stripe-signature"),
    env.STRIPE_WEBHOOK_SECRET,
  );

  let event: StripeEvent;

  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    throw new ApiError(
      400,
      "invalid_webhook",
      "Webhook payload is not valid JSON.",
    );
  }

  if (
    !event.id ||
    !event.type ||
    !event.data?.object
  ) {
    throw new ApiError(
      400,
      "invalid_webhook",
      "Webhook event is incomplete.",
    );
  }

  if (event.livemode !== liveMode) {
    throw new ApiError(
      409,
      "stripe_mode_mismatch",
      "Stripe event is from the wrong mode.",
    );
  }

  if (
    event.type === "checkout.session.expired" ||
    event.type ===
      "checkout.session.async_payment_failed"
  ) {
    if (!isCheckoutSession(event.data.object)) {
      throw new ApiError(
        400,
        "invalid_webhook_object",
        "Expected a Checkout Session.",
      );
    }

    await releaseExpiredCheckout(env, event);
    return json({
      received: true,
      fulfilled: false,
    });
  }

  if (
    event.type === "charge.refunded" ||
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.closed"
  ) {
    await handlePaymentLifecycle(env, event);

    return json({
      received: true,
      entitlementUpdated: true,
    });
  }

  if (
    event.type !== "checkout.session.completed" &&
    event.type !==
      "checkout.session.async_payment_succeeded"
  ) {
    await recordWebhookOnly(env, event);

    return json({
      received: true,
      fulfilled: false,
    });
  }

  if (!isCheckoutSession(event.data.object)) {
    throw new ApiError(
      400,
      "invalid_webhook_object",
      "Expected a Checkout Session.",
    );
  }

  if (event.data.object.payment_status !== "paid") {
    await recordWebhookOnly(env, event);

    return json({
      received: true,
      fulfilled: false,
    });
  }

  await fulfilPaidCheckout(env, event);

  return json({
    received: true,
    fulfilled: true,
  });
}

/*
 * Fulfill paid Checkout.
 *
 * Existing historical personal plans are supported
 * for webhook reconciliation, but new checkout
 * creation is limited to the active catalogue.
 */
async function fulfilPaidCheckout(
  env: Env,
  event: StripeEvent,
): Promise<void> {
  const session = event.data.object;

  if (!isCheckoutSession(session)) {
    throw new ApiError(400, "invalid_checkout_object", "Expected Checkout Session.");
  }
  if (session.payment_status !== "paid") {
    throw new ApiError(409, "checkout_not_paid", "Checkout is not paid.");
  }

  const planValue = session.metadata?.mybishbash_plan;
  if (!isPersonalPlan(planValue) || planValue === "BUSINESS") {
    throw new ApiError(400, "invalid_checkout_plan", "This purchase plan is not supported.");
  }
  const plan: PersonalPlan = planValue;
  const checkoutRequestId = session.metadata?.checkout_request_id;
  if (!checkoutRequestId || session.mode !== "payment") {
    throw new ApiError(400, "invalid_checkout_metadata", "Checkout metadata is incomplete.");
  }

  const expected = PERSONAL_PLANS[plan];
  if (
    session.amount_total !== expected.amountMinor ||
    session.currency?.toLowerCase() !== expected.currency
  ) {
    throw new ApiError(409, "checkout_amount_mismatch", "Paid amount does not match the plan.");
  }
  const expectedLive = expectedStripeLiveMode(env);
  if (event.livemode !== expectedLive || session.livemode !== expectedLive) {
    throw new ApiError(409, "stripe_mode_mismatch", "Checkout mode does not match the Worker.");
  }

  const checkout = await env.DB.prepare(
    `SELECT id, request_fingerprint, plan, stripe_price_id,
            stripe_checkout_session_id, stripe_checkout_url,
            stripe_checkout_expires_at, founding_reservation_id,
            status, last_error_code, updated_at
       FROM checkout_requests
      WHERE id = ?1 AND plan = ?2`,
  ).bind(checkoutRequestId, plan).first<CheckoutRecord>();

  if (!checkout) {
    throw new ApiError(409, "unknown_checkout", "Checkout was not created by this application.");
  }
  if (
    checkout.stripe_checkout_session_id &&
    checkout.stripe_checkout_session_id !== session.id
  ) {
    throw new ApiError(409, "checkout_session_mismatch", "Checkout Session does not match.");
  }
  if (session.client_reference_id !== checkoutRequestId) {
    throw new ApiError(409, "checkout_reference_mismatch", "Checkout reference does not match.");
  }
  if (plan === "FOUNDING_LIFETIME") {
    const reservationId = session.metadata?.founding_reservation_id;
    if (!reservationId || reservationId !== checkout.founding_reservation_id) {
      throw new ApiError(409, "founding_reservation_mismatch", "Founding reservation does not match.");
    }
  }

  const email = normaliseEmail(session.customer_details?.email);
  if (!Number.isSafeInteger(event.created) || event.created <= 0) {
    throw new ApiError(400, "invalid_stripe_event_time", "Invalid Stripe event timestamp.");
  }
  const paidAt = new Date(event.created * 1000);
  const paidAtIso = paidAt.toISOString();
  const receivedAt = new Date().toISOString();
  const expiration = addPlanDuration(paidAt, plan);
  const customerId = crypto.randomUUID();
  const purchaseId = crypto.randomUUID();
  const entitlementId = crypto.randomUUID();

  // D1.batch is transactional. No broad INSERT OR IGNORE: unrelated
  // CHECK, FK and UNIQUE errors must abort the entire fulfillment.
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO stripe_webhook_events (
         stripe_event_id, event_type, status, attempts,
         stripe_created_at, first_received_at, last_received_at, processed_at
       ) VALUES (?1, ?2, 'received', 1, ?3, ?4, ?4, NULL)
       ON CONFLICT(stripe_event_id) DO UPDATE SET
         attempts = stripe_webhook_events.attempts + 1,
         last_received_at = excluded.last_received_at`,
    ).bind(event.id, event.type, paidAtIso, receivedAt),

    env.DB.prepare(
      `INSERT INTO customers (
         id, email, email_normalized, stripe_customer_id,
         created_at, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(email_normalized) DO UPDATE SET
         email = excluded.email,
         stripe_customer_id = COALESCE(
           excluded.stripe_customer_id, customers.stripe_customer_id
         ),
         updated_at = excluded.updated_at`,
    ).bind(customerId, email.email, email.normalized, session.customer ?? null, receivedAt),

    // Replaying a completed Stripe Session must not create a second purchase.
    env.DB.prepare(
      `INSERT INTO purchases (
         id, customer_id, stripe_checkout_session_id,
         stripe_payment_intent_id, stripe_price_id, plan,
         amount_minor, currency, status, last_stripe_event_created,
         paid_at, created_at, updated_at
       )
       SELECT ?1, c.id, ?2, ?3, ?4, ?5, ?6, ?7,
              'paid', ?8, ?9, ?10, ?10
       FROM customers c
       WHERE c.email_normalized = ?11
         AND NOT EXISTS (
           SELECT 1 FROM purchases p
           WHERE p.stripe_checkout_session_id = ?2
         )`,
    ).bind(
      purchaseId, session.id, session.payment_intent ?? null,
      checkout.stripe_price_id, plan, expected.amountMinor,
      expected.currency, event.created, paidAtIso, receivedAt,
      email.normalized,
    ),

    env.DB.prepare(
      `INSERT INTO entitlements (
         id, customer_id, purchase_id, plan,
         starts_at, expires_at, revoked_at, created_at
       )
       SELECT ?1, p.customer_id, p.id, p.plan, ?2, ?3, NULL, ?4
       FROM purchases p
       WHERE p.stripe_checkout_session_id = ?5
         AND NOT EXISTS (
           SELECT 1 FROM entitlements e WHERE e.purchase_id = p.id
         )`,
    ).bind(
      entitlementId, paidAtIso, expiration?.toISOString() ?? null,
      receivedAt, session.id,
    ),

    // Fail *inside* the transaction if a paid entitlement is missing.
    // json_extract with an invalid JSON string raises an SQLite error.
    env.DB.prepare(
      `SELECT CASE WHEN EXISTS (
         SELECT 1 FROM purchases p
         JOIN entitlements e ON e.purchase_id = p.id
         JOIN customers c ON c.id = p.customer_id
         WHERE p.stripe_checkout_session_id = ?1
           AND p.plan = ?2 AND e.plan = ?2
           AND e.customer_id = p.customer_id
           AND c.email_normalized = ?3
           AND p.amount_minor = ?4 AND p.currency = ?5
           AND p.status = 'paid' AND e.revoked_at IS NULL
           AND (p.stripe_payment_intent_id = ?6 OR
                (p.stripe_payment_intent_id IS NULL AND ?6 IS NULL))
       ) THEN 1 ELSE json_extract('FULFILLMENT_MISSING', '$') END
       AS fulfillment_verified`,
    ).bind(
      session.id, plan, email.normalized,
      expected.amountMinor, expected.currency,
      session.payment_intent ?? null,
    ),

    env.DB.prepare(
      `UPDATE checkout_requests
          SET stripe_checkout_session_id = COALESCE(
                stripe_checkout_session_id, ?1
              ),
              status = 'completed', last_error_code = NULL,
              updated_at = ?2
        WHERE id = ?3 AND plan = ?4
          AND (stripe_checkout_session_id = ?1
               OR stripe_checkout_session_id IS NULL)`,
    ).bind(session.id, receivedAt, checkoutRequestId, plan),

    env.DB.prepare(
      `SELECT CASE WHEN EXISTS (
         SELECT 1 FROM checkout_requests
         WHERE id = ?1 AND stripe_checkout_session_id = ?2
           AND status = 'completed'
       ) THEN 1 ELSE json_extract('CHECKOUT_NOT_COMPLETED', '$') END
       AS checkout_verified`,
    ).bind(checkoutRequestId, session.id),
  ];

  if (plan === "FOUNDING_LIFETIME") {
    statements.push(
      env.DB.prepare(
        `UPDATE founding_reservations
            SET status = 'converted',
                converted_at = COALESCE(converted_at, ?1)
          WHERE id = ?2 AND checkout_request_id = ?3
            AND stripe_checkout_session_id = ?4
            AND status IN ('checkout_created', 'converted')`,
      ).bind(receivedAt, checkout.founding_reservation_id, checkoutRequestId, session.id),
      env.DB.prepare(
        `SELECT CASE WHEN EXISTS (
           SELECT 1 FROM founding_reservations
           WHERE id = ?1 AND checkout_request_id = ?2
             AND stripe_checkout_session_id = ?3 AND status = 'converted'
         ) THEN 1 ELSE json_extract('FOUNDING_NOT_CONVERTED', '$') END
         AS reservation_verified`,
      ).bind(checkout.founding_reservation_id, checkoutRequestId, session.id),
    );
  }

  statements.push(
    env.DB.prepare(
      `UPDATE stripe_webhook_events
          SET status = 'succeeded', processed_at = ?1
        WHERE stripe_event_id = ?2`,
    ).bind(receivedAt, event.id),
  );

  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.error("stripe_checkout_fulfillment_failed", {
      eventId: event.id,
      sessionId: session.id,
      plan,
      error: error instanceof Error ? error.message : "unknown",
    });
    throw new ApiError(
      500, "checkout_fulfillment_failed",
      "Payment received but access could not be created.",
    );
  }
}

/*
 * Expired Checkout handling.
 */
async function releaseExpiredCheckout(
  env: Env,
  event: StripeEvent,
): Promise<void> {
  const session = event.data.object;

  if (!isCheckoutSession(session)) {
    throw new ApiError(
      400,
      "invalid_checkout_object",
      "Expected Checkout Session.",
    );
  }

  const requestId =
    session.metadata?.checkout_request_id;

  if (!requestId) {
    await recordWebhookOnly(env, event);
    return;
  }

  const receivedAt = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `UPDATE checkout_requests
          SET status = 'expired',
              updated_at = ?1
        WHERE id = ?2
          AND stripe_checkout_session_id = ?3
          AND status IN ('creating', 'ready')`,
    ).bind(
      receivedAt,
      requestId,
      session.id,
    ),
  ];

  if (
    session.metadata?.mybishbash_plan ===
      "FOUNDING_LIFETIME" &&
    session.metadata?.founding_reservation_id
  ) {
    statements.push(
      env.DB.prepare(
        `UPDATE founding_reservations
            SET status = 'released'
          WHERE id = ?1
            AND checkout_request_id = ?2
            AND stripe_checkout_session_id = ?3
            AND status = 'checkout_created'`,
      ).bind(
        session.metadata.founding_reservation_id,
        requestId,
        session.id,
      ),
    );
  }

  await env.DB.batch(statements);
  await recordWebhookOnly(env, event);
}

/*
 * Refund/dispute event mapping.
 */
export function paymentLifecycleAction(
  eventType: string,
  payment: {
    refunded?: boolean;
    status?: string;
  },
): {
  nextStatus: "paid" | "refunded" | "disputed";
  revoke: boolean;
  restoreWonDispute: boolean;
} | null {
  if (
    eventType === "charge.refunded" &&
    payment.refunded === true
  ) {
    return {
      nextStatus: "refunded",
      revoke: true,
      restoreWonDispute: false,
    };
  }

  if (eventType === "charge.dispute.created") {
    return {
      nextStatus: "disputed",
      revoke: true,
      restoreWonDispute: false,
    };
  }

  if (
    eventType === "charge.dispute.closed" &&
    payment.status === "won"
  ) {
    return {
      nextStatus: "paid",
      revoke: false,
      restoreWonDispute: true,
    };
  }

  if (
    eventType === "charge.dispute.closed" &&
    payment.status === "lost"
  ) {
    return {
      nextStatus: "disputed",
      revoke: true,
      restoreWonDispute: false,
    };
  }

  return null;
}

async function resolvePaymentIntentId(
  env: Env,
  object: StripeObject,
): Promise<string | null> {
  if (
    object.object === "charge" &&
    typeof object.payment_intent === "string"
  ) {
    return object.payment_intent;
  }

  if (object.object === "dispute") {
    if (typeof object.payment_intent === "string") {
      return object.payment_intent;
    }

    if (typeof object.charge === "string") {
      const charge = await stripeRequest<StripeCharge>(
        env,
        `/v1/charges/${encodeURIComponent(object.charge)}`,
        { method: "GET" },
      );

      return typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : null;
    }
  }

  return null;
}

async function handlePaymentLifecycle(
  env: Env,
  event: StripeEvent,
): Promise<void> {
  const payment = event.data.object;

  const paymentIntentId =
    await resolvePaymentIntentId(env, payment);

  if (!paymentIntentId) {
    await recordWebhookOnly(env, event);
    return;
  }

const action = paymentLifecycleAction(
  event.type,
  {
    refunded:
      payment.object === "charge"
        ? payment.refunded
        : undefined,

    status:
      payment.object === "charge" ||
      payment.object === "dispute"
        ? payment.status
        : undefined,
  },
);

  if (!action) {
    await recordWebhookOnly(env, event);
    return;
  }

  const receivedAt = new Date().toISOString();

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO stripe_webhook_events (
         stripe_event_id, event_type,
         status, attempts, stripe_created_at,
         first_received_at, last_received_at,
         processed_at
       ) VALUES (
         ?1, ?2, 'received', 1,
         ?3, ?4, ?4, NULL
       )
       ON CONFLICT(stripe_event_id)
       DO UPDATE SET
         attempts =
           stripe_webhook_events.attempts + 1,
         last_received_at =
           excluded.last_received_at`,
    ).bind(
      event.id,
      event.type,
      new Date(event.created * 1000).toISOString(),
      receivedAt,
    ),
  ];

  if (action.restoreWonDispute) {
    statements.push(
      env.DB.prepare(
        `UPDATE purchases
            SET status = 'paid',
                updated_at = ?1,
                last_stripe_event_created = ?2
          WHERE stripe_payment_intent_id = ?3
            AND status = 'disputed'
            AND last_stripe_event_created <= ?2`,
      ).bind(
        receivedAt,
        event.created,
        paymentIntentId,
      ),
      env.DB.prepare(
        `UPDATE entitlements
            SET revoked_at = NULL
          WHERE purchase_id IN (
            SELECT id FROM purchases
            WHERE stripe_payment_intent_id = ?1
              AND status = 'paid'
              AND last_stripe_event_created = ?2
          )`,
      ).bind(
        paymentIntentId,
        event.created,
      ),
    );
  } else {
    statements.push(
      env.DB.prepare(
        `UPDATE purchases
            SET status = ?1,
                updated_at = ?2,
                last_stripe_event_created = ?3
          WHERE stripe_payment_intent_id = ?4
            AND status != 'refunded'
            AND last_stripe_event_created <= ?3`,
      ).bind(
        action.nextStatus,
        receivedAt,
        event.created,
        paymentIntentId,
      ),
    );

    if (action.revoke) {
      statements.push(
        env.DB.prepare(
          `UPDATE entitlements
              SET revoked_at =
                COALESCE(revoked_at, ?1)
            WHERE purchase_id IN (
              SELECT id FROM purchases
              WHERE stripe_payment_intent_id = ?2
                AND status = ?3
                AND last_stripe_event_created = ?4
            )`,
        ).bind(
          receivedAt,
          paymentIntentId,
          action.nextStatus,
          event.created,
        ),
      );
    }
  }

  statements.push(
    env.DB.prepare(
      `UPDATE stripe_webhook_events
          SET status = 'succeeded',
              processed_at = ?1
        WHERE stripe_event_id = ?2`,
    ).bind(receivedAt, event.id),
  );

  await env.DB.batch(statements);
}

/*
 * Founding Lifetime availability.
 *
 * Retired from new checkout but retained for
 * historical purchases and existing customers.
 */
export async function foundingAvailability(
  env: Env,
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS successful_purchases
       FROM purchases
      WHERE plan = 'FOUNDING_LIFETIME'
        AND status = 'paid'`,
  ).first<{ successful_purchases: number }>();

  const successfulPurchases = Math.min(
    FOUNDING_LIFETIME_LIMIT,
    Number(row?.successful_purchases ?? 0),
  );

  return json({
    limit: FOUNDING_LIFETIME_LIMIT,
    successfulPurchases,
    remaining: Math.max(
      0,
      FOUNDING_LIFETIME_LIMIT - successfulPurchases,
    ),
    soldOut:
      successfulPurchases >= FOUNDING_LIFETIME_LIMIT,
    label:
      "Limited to 500 Founding Lifetime memberships",
  });
}

/*
 * Email-based entitlement restoration.
 */
export async function requestEntitlementRestore(
  request: Request,
  env: Env,
  context: ExecutionContext,
): Promise<Response> {
  const body = await readJson<{
    email?: unknown;
  }>(request);

  const email = normaliseEmail(body.email);
  const now = new Date();

  const customer = await env.DB.prepare(
    `SELECT DISTINCT c.id, c.email
       FROM customers c
       JOIN entitlements e
         ON e.customer_id = c.id
      WHERE c.email_normalized = ?1
        AND e.revoked_at IS NULL
        AND (
          e.expires_at IS NULL OR
          e.expires_at > ?2
        )
      LIMIT 1`,
  )
    .bind(email.normalized, now.toISOString())
    .first<{ id: string; email: string }>();

  if (customer) {
    const token = randomToken(
      "mbb_restore_",
      32,
    );

    const expiresAt = new Date(
      now.getTime() + 15 * 60 * 1000,
    );

    await env.DB.prepare(
      `INSERT INTO entitlement_restore_tokens (
         id, customer_id, token_hash,
         expires_at, consumed_at, created_at
       ) VALUES (?1, ?2, ?3, ?4, NULL, ?5)`,
    )
      .bind(
        crypto.randomUUID(),
        customer.id,
        await sha256Hex(token),
        expiresAt.toISOString(),
        now.toISOString(),
      )
      .run();

    context.waitUntil(
      env.ENTITLEMENT_EMAIL_QUEUE.send({
        type:
          "mybishbash.photobooth.entitlement_restore",
        to: customer.email,
        token,
        verifyUrl:
          `${appOrigin(env)}/photobooth/restore`,
        expiresAt: expiresAt.toISOString(),
      }).catch((error: unknown) => {
        console.error(
          "entitlement_restore_queue_failed",
          {
            customerId: customer.id,
            error:
              error instanceof Error
                ? error.message
                : "unknown",
          },
        );
      }),
    );
  }

  return json(
    {
      accepted: true,
      message:
        "If that address has active access, a restore link will be sent.",
    },
    202,
  );
}

export async function verifyEntitlementRestore(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await readJson<{
    token?: unknown;
  }>(request);

  const token = requireString(
    body.token,
    "token",
    { min: 40, max: 200 },
  );

  const now = new Date();
  const hash = await sha256Hex(token);

  const row = await env.DB.prepare(
    `SELECT id, customer_id
       FROM entitlement_restore_tokens
      WHERE token_hash = ?1
        AND consumed_at IS NULL
        AND expires_at > ?2`,
  )
    .bind(hash, now.toISOString())
    .first<{
      id: string;
      customer_id: string;
    }>();

  if (!row) {
    throw new ApiError(
      401,
      "invalid_restore_token",
      "Restore link is invalid or expired.",
    );
  }

  const consumed = await env.DB.prepare(
    `UPDATE entitlement_restore_tokens
        SET consumed_at = ?1
      WHERE id = ?2
        AND consumed_at IS NULL
        AND expires_at > ?1`,
  )
    .bind(now.toISOString(), row.id)
    .run();

  if ((consumed.meta.changes ?? 0) !== 1) {
    throw new ApiError(
      401,
      "invalid_restore_token",
      "Restore link is invalid or expired.",
    );
  }

  const exp =
    Math.floor(now.getTime() / 1000) +
    30 * 24 * 60 * 60;

  const claims: PersonalAccessClaims = {
    purpose: "personal_access",
    sub: row.customer_id,
    iat: Math.floor(now.getTime() / 1000),
    exp,
  };

  const accessToken = await signClaims(
    claims,
    env.TOKEN_SIGNING_SECRET,
  );

  return entitlementResponse(
    env,
    row.customer_id,
    accessToken,
    new Date(exp * 1000),
  );
}

/*
 * Current authenticated entitlement.
 */
export async function currentEntitlement(
  request: Request,
  env: Env,
): Promise<Response> {
  const authorization =
    request.headers.get("authorization");

  if (!authorization) {
    return json({
      plan: "FREE",
      capabilities: capabilitiesForPlan("FREE"),
      entitlements: [],
    });
  }

  if (/^Bearer\s+mbb_bus_/i.test(authorization)) {
    await requireBusiness(request, env);

    return json({
      plan: "BUSINESS",
      capabilities: capabilitiesForPlan("BUSINESS"),
    });
  }

  const claims = await requirePersonalAccess(
    request,
    env,
  );

  return entitlementResponse(
    env,
    claims.sub,
    bearerToken(request),
    new Date(claims.exp * 1000),
  );
}

async function entitlementResponse(
  env: Env,
  customerId: string,
  accessToken?: string,
  accessTokenExpiresAt?: Date,
): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT plan, starts_at, expires_at
       FROM entitlements
      WHERE customer_id = ?1
        AND revoked_at IS NULL
        AND (
          expires_at IS NULL OR
          expires_at > ?2
        )
      ORDER BY CASE plan
        WHEN 'FOUNDING_LIFETIME' THEN 4
        WHEN 'PERSONAL_12_MONTH' THEN 3
        WHEN 'PERSONAL_6_MONTH' THEN 2
        WHEN 'ONE_EVENT' THEN 1
        ELSE 0
      END DESC`,
  )
    .bind(customerId, new Date().toISOString())
    .all<EntitlementRow>();

  const entitlements = rows.results ?? [];

  const plan: EntitlementPlan =
    entitlements[0]?.plan ?? "FREE";

  return json({
    plan,
    capabilities: capabilitiesForPlan(plan),

    entitlements: entitlements.map((row) => ({
      plan: row.plan,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
    })),

    ...(accessToken
      ? {
          accessToken,
          accessTokenExpiresAt:
            accessTokenExpiresAt?.toISOString(),
        }
      : {}),
  });
}
