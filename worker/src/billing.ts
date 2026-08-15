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
const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

interface CheckoutRequestBody {
  plan?: unknown;
  email?: unknown;
}

interface StripeCheckoutSession {
  id: string;
  object: string;
  url?: string | null;
  mode?: string;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
  customer?: string | null;
  customer_details?: { email?: string | null } | null;
  payment_intent?: string | null;
  metadata?: Record<string, string> | null;
  livemode?: boolean;
  client_reference_id?: string | null;
  expires_at?: number | null;
  refunded?: boolean;
  amount_refunded?: number;
  amount?: number;
  status?: string;
}

interface StripePrice {
  id: string;
  object: "price";
  active: boolean;
  currency: string;
  type: "one_time" | "recurring";
  unit_amount: number | null;
}

interface StripeEvent {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  data: { object: StripeCheckoutSession };
}

interface CheckoutRecord {
  id: string;
  request_fingerprint: string;
  plan: string; // Changed to string to accept Business/OneEvent
  stripe_price_id: string;
  stripe_checkout_session_id: string | null;
  stripe_checkout_url: string | null;
  stripe_checkout_expires_at: string | null;
  founding_reservation_id: string | null;
  status: "creating" | "ready" | "completed" | "expired" | "failed";
  last_error_code: string | null;
  updated_at: string;
}

interface EntitlementRow {
  plan: PersonalPlan;
  starts_at: string;
  expires_at: string | null;
}

export async function createCheckout(request: Request, env: Env): Promise<Response> {
  requireConfiguredSecret(env.STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY");
  validateStripeKeyMode(env, expectedStripeLiveMode(env));
  const body = await readJson<CheckoutRequestBody>(request);
  
  // ✅ UPDATED: Allows ONE_EVENT and BUSINESS alongside existing Personal plans
  const allowedPlans = ["ONE_EVENT", "BUSINESS"];
  const plan = body.plan as string;
  if (!isPersonalPlan(plan) && !allowedPlans.includes(plan)) {
    throw new ApiError(400, "invalid_plan", "Choose a valid Personal, One Event, or Business plan.");
  }

  const email = body.email === undefined ? null : normaliseEmail(body.email);
  const clientIdempotencyKey = request.headers.get("idempotency-key") ?? randomToken("auto_", 18);
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(clientIdempotencyKey)) {
    throw new ApiError(
      400,
      "invalid_idempotency_key",
      "Idempotency-Key must be 8–128 safe ASCII characters.",
    );
  }
  const idempotencyHash = await sha256Hex(clientIdempotencyKey);
  const requestFingerprint = await sha256Hex(`${plan}\n${email?.normalized ?? ""}`);

  let existing = await env.DB.prepare(
    `SELECT id, request_fingerprint, plan, stripe_price_id,
            stripe_checkout_session_id, stripe_checkout_url,
            stripe_checkout_expires_at, founding_reservation_id,
            status, last_error_code, updated_at
       FROM checkout_requests
      WHERE idempotency_key_hash = ?1`,
  )
    .bind(idempotencyHash)
    .first<CheckoutRecord>();
  if (existing?.request_fingerprint !== undefined && existing.request_fingerprint !== requestFingerprint) {
    throw new ApiError(
      409,
      "idempotency_key_reused",
      "That Idempotency-Key was already used with different Checkout details.",
    );
  }
  if (existing?.status === "ready" || existing?.status === "completed" || existing?.status === "expired") {
    return checkoutRecordResponse(existing);
  }
  if (existing?.status === "failed") {
    throw new ApiError(
      409,
      existing.last_error_code ?? "checkout_failed",
      "That Checkout request cannot be retried. Start again with a new Idempotency-Key.",
    );
  }
  if (
    existing?.status === "creating" &&
    Date.now() - Date.parse(existing.updated_at) < 5_000
  ) {
    throw new ApiError(
      409,
      "checkout_in_progress",
      "That Checkout request is still being prepared. Retry with the same key shortly.",
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const requestId = existing?.id ?? crypto.randomUUID();
  const reservationId = existing?.founding_reservation_id ??
    (plan === "FOUNDING_LIFETIME" ? crypto.randomUUID() : null);
  const priceId = existing?.stripe_price_id ?? stripePriceId(env, plan);
  
  if (!existing) {
    await validateStripePrice(env, priceId, plan);
    try {
      await env.DB.prepare(
        `INSERT INTO checkout_requests (
           id, idempotency_key_hash, request_fingerprint, plan,
           email_normalized, stripe_price_id, stripe_checkout_session_id,
           stripe_checkout_url, stripe_checkout_expires_at,
           founding_reservation_id, status, last_error_code,
           created_at, updated_at
         ) VALUES (
           ?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, NULL, ?7,
           'creating', NULL, ?8, ?8
         )`,
      )
        .bind(
          requestId,
          idempotencyHash,
          requestFingerprint,
          plan,
          email?.normalized ?? null,
          priceId,
          reservationId,
          nowIso,
        )
        .run();
    } catch {
      existing = await env.DB.prepare(
        `SELECT id, request_fingerprint, plan, stripe_price_id,
                stripe_checkout_session_id, stripe_checkout_url,
                stripe_checkout_expires_at, founding_reservation_id,
                status, last_error_code, updated_at
           FROM checkout_requests WHERE idempotency_key_hash = ?1`,
      )
        .bind(idempotencyHash)
        .first<CheckoutRecord>();
      if (!existing) {
        throw new ApiError(503, "checkout_unavailable", "Checkout is temporarily unavailable.");
      }
      if (existing.request_fingerprint !== requestFingerprint) {
        throw new ApiError(409, "idempotency_key_reused", "That key belongs to another request.");
      }
      return checkoutRecordResponse(existing);
    }
  } else {
    await env.DB.prepare(
      `UPDATE checkout_requests
          SET updated_at = ?1, last_error_code = NULL
        WHERE id = ?2 AND status = 'creating'`,
    )
      .bind(nowIso, requestId)
      .run();
  }

  // Stripe's minimum is 30 minutes. Use 31 so transit/processing time cannot
  // make an otherwise valid request fall a few seconds below that boundary.
  const checkoutExpiresAt = new Date(now.getTime() + 31 * 60 * 1000);
  const reservationExpiresAt = new Date(now.getTime() + 35 * 60 * 1000);
  if (reservationId && !existing) {
    const reservation = await env.DB.prepare(
      `INSERT INTO founding_reservations (
         id, checkout_request_id, stripe_checkout_session_id, status,
         reserved_at, expires_at, converted_at
       )
       SELECT ?1, ?2, NULL, 'reserved', ?3, ?4, NULL
        WHERE (
          (SELECT COUNT(*) FROM purchases
            WHERE plan = 'FOUNDING_LIFETIME' AND status = 'paid')
          +
          (SELECT COUNT(*) FROM founding_reservations
            WHERE (status = 'reserved' AND expires_at > ?3)
               OR status = 'checkout_created')
        ) < ?5`,
    )
      .bind(
        reservationId,
        requestId,
        nowIso,
        reservationExpiresAt.toISOString(),
        FOUNDING_LIFETIME_LIMIT,
      )
      .run();
    if ((reservation.meta.changes ?? 0) !== 1) {
      await env.DB.prepare(
        `UPDATE checkout_requests
            SET status = 'failed', last_error_code = 'founding_lifetime_sold_out',
                updated_at = ?1
          WHERE id = ?2`,
      )
        .bind(nowIso, requestId)
        .run();
      throw new ApiError(
        409,
        "founding_lifetime_sold_out",
        "All Founding Lifetime memberships are currently purchased or reserved.",
      );
    }
  } else if (reservationId) {
    const reservation = await env.DB.prepare(
      `SELECT status, expires_at FROM founding_reservations
        WHERE id = ?1 AND checkout_request_id = ?2`,
    )
      .bind(reservationId, requestId)
      .first<{ status: string; expires_at: string }>();
    if (
      !reservation ||
      reservation.status === "released" ||
      (reservation.status === "reserved" && reservation.expires_at <= nowIso)
    ) {
      await env.DB.prepare(
        `UPDATE checkout_requests SET status = 'expired', updated_at = ?1 WHERE id = ?2`,
      )
        .bind(nowIso, requestId)
        .run();
      throw new ApiError(410, "checkout_expired", "This Checkout expired. Start again.");
    }
  }

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("line_items[0][price]", priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("client_reference_id", requestId);
  form.set("customer_creation", "always");
  form.set("success_url", `${appOrigin(env)}/photobooth?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${appOrigin(env)}/photobooth?checkout=cancelled`);
  form.set("metadata[mybishbash_plan]", plan);
  form.set("metadata[checkout_request_id]", requestId);
  form.set("payment_intent_data[metadata][mybishbash_plan]", plan);
  form.set("payment_intent_data[metadata][checkout_request_id]", requestId);
  if (email) form.set("customer_email", email.email);
  if (reservationId) {
    form.set("metadata[founding_reservation_id]", reservationId);
    form.set("expires_at", String(Math.floor(checkoutExpiresAt.getTime() / 1000)));
  }

  let session: StripeCheckoutSession;
  try {
    session = await stripeRequest<StripeCheckoutSession>(env, "/v1/checkout/sessions", {
      method: "POST",
      body: form,
      idempotencyKey: `mybishbash-checkout-${requestId}`,
    });
  } catch (error) {
    await env.DB.prepare(
      `UPDATE checkout_requests
          SET last_error_code = 'stripe_request_failed', updated_at = ?1
        WHERE id = ?2 AND status = 'creating'`,
    )
      .bind(new Date().toISOString(), requestId)
      .run();
    throw error;
  }

  if (!session.id || !session.url) {
    throw new ApiError(502, "invalid_stripe_response", "Stripe did not return a Checkout URL.");
  }
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `UPDATE checkout_requests
          SET stripe_checkout_session_id = ?1, stripe_checkout_url = ?2,
              stripe_checkout_expires_at = ?3, status = 'ready',
              last_error_code = NULL, updated_at = ?4
        WHERE id = ?5 AND status = 'creating'`,
    ).bind(
      session.id,
      session.url,
      new Date((session.expires_at ?? Math.floor(checkoutExpiresAt.getTime() / 1000)) * 1000).toISOString(),
      new Date().toISOString(),
      requestId,
    ),
  ];
  if (reservationId) {
    statements.push(
      env.DB.prepare(
        `UPDATE founding_reservations
            SET stripe_checkout_session_id = ?1, status = 'checkout_created'
          WHERE id = ?2 AND status = 'reserved'`,
      ).bind(session.id, reservationId),
    );
  }
  await env.DB.batch(statements);

  return json(
    {
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
      plan,
      entitlementPending: true,
      note: "Access is granted only after a verified Stripe webhook.",
    },
    201,
  );
}

export async function stripeWebhook(request: Request, env: Env): Promise<Response> {
  requireConfiguredSecret(env.STRIPE_WEBHOOK_SECRET, "STRIPE_WEBHOOK_SECRET");
  expectedStripeLiveMode(env);
  const payload = await readTextBounded(request, 1_048_576);
  await verifyStripeSignature(
    payload,
    request.headers.get("stripe-signature"),
    env.STRIPE_WEBHOOK_SECRET,
  );
  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    throw new ApiError(400, "invalid_webhook", "The webhook payload is not valid JSON.");
  }
  if (!event.id || !event.type || !event.data?.object) {
    throw new ApiError(400, "invalid_webhook", "The webhook event is incomplete.");
  }
  if (event.livemode !== expectedStripeLiveMode(env)) {
    throw new ApiError(409, "stripe_mode_mismatch", "The Stripe event is from the wrong mode.");
  }
  const supported = new Set([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
  ]);
  if (
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    await releaseExpiredCheckout(env, event);
    return json({ received: true, fulfilled: false, reservationReleased: true });
  }
  if (
    event.type === "charge.refunded" ||
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.closed"
  ) {
    await handlePaymentLifecycle(env, event);
    return json({ received: true, entitlementUpdated: true });
  }
  if (!supported.has(event.type) || event.data.object.payment_status !== "paid") {
    await recordWebhookOnly(env, event);
    return json({ received: true, fulfilled: false });
  }

  await fulfilPaidCheckout(env, event);
  return json({ received: true, fulfilled: true });
}

async function handlePaymentLifecycle(env: Env, event: StripeEvent): Promise<void> {
  const payment = event.data.object;
  const paymentIntentId = typeof payment.payment_intent === "string"
    ? payment.payment_intent
    : null;
  if (!paymentIntentId) {
    await recordWebhookOnly(env, event);
    return;
  }
  const action = paymentLifecycleAction(event.type, payment);
  if (!action) {
    await recordWebhookOnly(env, event);
    return;
  }

  const receivedAt = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO stripe_webhook_events (
         stripe_event_id, event_type, status, attempts, stripe_created_at,
         first_received_at, last_received_at, processed_at
       ) VALUES (?1, ?2, 'received', 1, ?3, ?4, ?4, NULL)
       ON CONFLICT(stripe_event_id) DO UPDATE SET
         attempts = stripe_webhook_events.attempts + 1,
         last_received_at = excluded.last_received_at`,
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
            SET status = 'paid', updated_at = ?1,
                last_stripe_event_created = ?2
          WHERE stripe_payment_intent_id = ?3 AND status = 'disputed'
            AND last_stripe_event_created <= ?2`,
      ).bind(receivedAt, event.created, paymentIntentId),
      env.DB.prepare(
        `UPDATE entitlements SET revoked_at = NULL
          WHERE purchase_id IN (
            SELECT id FROM purchases
             WHERE stripe_payment_intent_id = ?1 AND status = 'paid'
               AND last_stripe_event_created = ?2
          )`,
      ).bind(paymentIntentId, event.created),
    );
  } else {
    statements.push(
      env.DB.prepare(
        `UPDATE purchases
            SET status = ?1, updated_at = ?2,
                last_stripe_event_created = ?3
          WHERE stripe_payment_intent_id = ?4
            AND status != 'refunded'
            AND last_stripe_event_created <= ?3`,
      ).bind(action.nextStatus, receivedAt, event.created, paymentIntentId),
    );
    if (action.revoke) {
      statements.push(
        env.DB.prepare(
          `UPDATE entitlements SET revoked_at = COALESCE(revoked_at, ?1)
            WHERE purchase_id IN (
              SELECT id FROM purchases
               WHERE stripe_payment_intent_id = ?2
                 AND status = ?3
                 AND last_stripe_event_created = ?4
            )`,
        ).bind(receivedAt, paymentIntentId, action.nextStatus, event.created),
      );
    }
  }
  statements.push(
    env.DB.prepare(
      `UPDATE stripe_webhook_events
          SET status = 'succeeded', processed_at = ?1
        WHERE stripe_event_id = ?2`,
    ).bind(receivedAt, event.id),
  );
  await env.DB.batch(statements);
}

export function paymentLifecycleAction(
  eventType: string,
  payment: Pick<StripeCheckoutSession, "refunded" | "status">,
): {
  nextStatus: "paid" | "refunded" | "disputed";
  revoke: boolean;
  restoreWonDispute: boolean;
} | null {
  if (eventType === "charge.refunded" && payment.refunded === true) {
    return { nextStatus: "refunded", revoke: true, restoreWonDispute: false };
  }
  if (eventType === "charge.dispute.created") {
    return { nextStatus: "disputed", revoke: true, restoreWonDispute: false };
  }
  if (eventType === "charge.dispute.closed" && payment.status === "won") {
    return { nextStatus: "paid", revoke: false, restoreWonDispute: true };
  }
  if (eventType === "charge.dispute.closed" && payment.status === "lost") {
    return { nextStatus: "disputed", revoke: true, restoreWonDispute: false };
  }
  return null;
}

async function releaseExpiredCheckout(env: Env, event: StripeEvent): Promise<void> {
  const session = event.data.object;
  const reservationId = session.metadata?.founding_reservation_id;
  const checkoutRequestId = session.metadata?.checkout_request_id;
  if (
    session.metadata?.mybishbash_plan !== "FOUNDING_LIFETIME" ||
    !reservationId ||
    !checkoutRequestId
  ) {
    await recordWebhookOnly(env, event);
    return;
  }
  const receivedAt = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO stripe_webhook_events (
         stripe_event_id, event_type, status, attempts, stripe_created_at,
         first_received_at, last_received_at, processed_at
       ) VALUES (?1, ?2, 'succeeded', 1, ?3, ?4, ?4, ?4)
       ON CONFLICT(stripe_event_id) DO UPDATE SET
         attempts = stripe_webhook_events.attempts + 1,
         last_received_at = excluded.last_received_at`,
    ).bind(
      event.id,
      event.type,
      new Date(event.created * 1000).toISOString(),
      receivedAt,
    ),
    env.DB.prepare(
      `UPDATE founding_reservations
          SET status = 'released'
        WHERE id = ?1 AND checkout_request_id = ?2
          AND stripe_checkout_session_id = ?3
          AND status = 'checkout_created'`,
    ).bind(reservationId, checkoutRequestId, session.id),
    env.DB.prepare(
      `UPDATE checkout_requests
          SET status = 'expired', updated_at = ?1
        WHERE id = ?2 AND stripe_checkout_session_id = ?3
          AND status IN ('creating', 'ready')`,
    ).bind(receivedAt, checkoutRequestId, session.id),
  ]);
}

export async function foundingAvailability(env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS successful_purchases
       FROM purchases
      WHERE plan = 'FOUNDING_LIFETIME' AND status = 'paid'`,
  ).first<{ successful_purchases: number }>();
  const successfulPurchases = Math.min(
    FOUNDING_LIFETIME_LIMIT,
    Number(row?.successful_purchases ?? 0),
  );
  return json({
    limit: FOUNDING_LIFETIME_LIMIT,
    successfulPurchases,
    remaining: Math.max(0, FOUNDING_LIFETIME_LIMIT - successfulPurchases),
    soldOut: successfulPurchases >= FOUNDING_LIFETIME_LIMIT,
    label: "Limited to 500 Founding Lifetime memberships",
  });
}

export async function requestEntitlementRestore(
  request: Request,
  env: Env,
  context: ExecutionContext,
): Promise<Response> {
  const body = await readJson<{ email?: unknown }>(request);
  const email = normaliseEmail(body.email);
  const now = new Date();
  const customer = await env.DB.prepare(
    `SELECT DISTINCT c.id, c.email
       FROM customers c
       JOIN entitlements e ON e.customer_id = c.id
      WHERE c.email_normalized = ?1
        AND e.revoked_at IS NULL
        AND (e.expires_at IS NULL OR e.expires_at > ?2)
      LIMIT 1`,
  )
    .bind(email.normalized, now.toISOString())
    .first<{ id: string; email: string }>();

  if (customer) {
    const rawToken = randomToken("mbb_restore_", 32);
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
    await env.DB.prepare(
      `INSERT INTO entitlement_restore_tokens (
         id, customer_id, token_hash, expires_at, consumed_at, created_at
       ) VALUES (?1, ?2, ?3, ?4, NULL, ?5)`,
    )
      .bind(
        crypto.randomUUID(),
        customer.id,
        await sha256Hex(rawToken),
        expiresAt.toISOString(),
        now.toISOString(),
      )
      .run();
    context.waitUntil(
      env.ENTITLEMENT_EMAIL_QUEUE.send({
        type: "mybishbash.photobooth.entitlement_restore",
        to: customer.email,
        token: rawToken,
        verifyUrl: `${appOrigin(env)}/photobooth/restore`,
        expiresAt: expiresAt.toISOString(),
      }).catch((error: unknown) => {
        console.error("entitlement_restore_queue_failed", {
          customerId: customer.id,
          error: error instanceof Error ? error.message : "unknown",
        });
      }),
    );
  }

  // Identical response whether or not an account exists prevents enumeration.
  return json(
    {
      accepted: true,
      message: "If that address has active access, a restore link will be sent.",
    },
    202,
  );
}

export async function verifyEntitlementRestore(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ token?: unknown }>(request);
  const rawToken = requireString(body.token, "token", { min: 40, max: 200 });
  const now = new Date();
  const tokenHash = await sha256Hex(rawToken);
  const row = await env.DB.prepare(
    `SELECT id, customer_id
       FROM entitlement_restore_tokens
      WHERE token_hash = ?1 AND consumed_at IS NULL AND expires_at > ?2`,
  )
    .bind(tokenHash, now.toISOString())
    .first<{ id: string; customer_id: string }>();
  if (!row) {
    throw new ApiError(401, "invalid_restore_token", "The restore link is invalid or expired.");
  }
  const consumed = await env.DB.prepare(
    `UPDATE entitlement_restore_tokens
        SET consumed_at = ?1
      WHERE id = ?2 AND consumed_at IS NULL AND expires_at > ?1`,
  )
    .bind(now.toISOString(), row.id)
    .run();
  if ((consumed.meta.changes ?? 0) !== 1) {
    throw new ApiError(401, "invalid_restore_token", "The restore link is invalid or expired.");
  }

  const exp = Math.floor(now.getTime() / 1000) + 30 * 24 * 60 * 60;
  const claims: PersonalAccessClaims = {
    purpose: "personal_access",
    sub: row.customer_id,
    iat: Math.floor(now.getTime() / 1000),
    exp,
  };
  const accessToken = await signClaims(claims, env.TOKEN_SIGNING_SECRET);
  return entitlementResponse(env, row.customer_id, accessToken, new Date(exp * 1000));
}

export async function currentEntitlement(request: Request, env: Env): Promise<Response> {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return json({ plan: "FREE", capabilities: capabilitiesForPlan("FREE"), entitlements: [] });
  }
  if (/^Bearer\s+mbb_bus_/i.test(authorization)) {
    await requireBusiness(request, env);
    return json({ plan: "BUSINESS", capabilities: capabilitiesForPlan("BUSINESS") });
  }
  const claims = await requirePersonalAccess(request, env);
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
        AND (expires_at IS NULL OR expires_at > ?2)
      ORDER BY CASE plan
        WHEN 'FOUNDING_LIFETIME' THEN 3
        WHEN 'PERSONAL_12_MONTH' THEN 2
        ELSE 1 END DESC`,
  )
    .bind(customerId, new Date().toISOString())
    .all<EntitlementRow>();
  const entitlements = rows.results ?? [];
  const plan: EntitlementPlan = entitlements[0]?.plan ?? "FREE";
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
          accessTokenExpiresAt: accessTokenExpiresAt?.toISOString(),
        }
      : {}),
  });
}

async function fulfilPaidCheckout(env: Env, event: StripeEvent): Promise<void> {
  const session = event.data.object;
  const planValue = session.metadata?.mybishbash_plan;
  // Update this check to allow ONE_EVENT and BUSINESS as well
  if (!isPersonalPlan(planValue) && planValue !== "ONE_EVENT" && planValue !== "BUSINESS") {
    throw new ApiError(400, "invalid_checkout_metadata", "The Checkout plan is invalid.");
  }
  const plan = planValue;
  const checkoutRequestId = session.metadata?.checkout_request_id;
  if (!checkoutRequestId || session.mode !== "payment") {
    throw new ApiError(400, "invalid_checkout_metadata", "The Checkout metadata is incomplete.");
  }
  const expected = PERSONAL_PLANS[plan]; // This requires updating policy.ts!
  if (
    session.amount_total !== expected.amountMinor ||
    session.currency?.toLowerCase() !== expected.currency
  ) {
    throw new ApiError(409, "checkout_amount_mismatch", "The paid amount does not match the plan.");
  }
  const expectedLiveMode = expectedStripeLiveMode(env);
  if (event.livemode !== expectedLiveMode || session.livemode !== expectedLiveMode) {
    throw new ApiError(409, "stripe_mode_mismatch", "The Stripe event is from the wrong mode.");
  }
  const email = normaliseEmail(session.customer_details?.email);
  const checkout = await env.DB.prepare(
    `SELECT id, request_fingerprint, plan, stripe_price_id,
            stripe_checkout_session_id, stripe_checkout_url,
            stripe_checkout_expires_at, founding_reservation_id,
            status, last_error_code, updated_at
       FROM checkout_requests
      WHERE id = ?1 AND plan = ?2`,
  )
    .bind(checkoutRequestId, plan)
    .first<CheckoutRecord>();
  if (!checkout) {
    throw new ApiError(409, "unknown_checkout", "The Checkout Session was not created here.");
  }
  if (checkout.stripe_checkout_session_id && checkout.stripe_checkout_session_id !== session.id) {
    throw new ApiError(409, "checkout_session_mismatch", "The Checkout Session does not match.");
  }
  if (session.client_reference_id !== checkoutRequestId) {
    throw new ApiError(
      409,
      "checkout_reference_mismatch",
      "The Checkout client reference does not match.",
    );
  }
  if (plan === "FOUNDING_LIFETIME") {
    const reservationId = session.metadata?.founding_reservation_id;
    if (!reservationId || reservationId !== checkout.founding_reservation_id) {
      throw new ApiError(409, "founding_reservation_mismatch", "The founding reservation is invalid.");
    }
    const reservation = await env.DB.prepare(
      `SELECT id, checkout_request_id, stripe_checkout_session_id, status
         FROM founding_reservations
        WHERE id = ?1 AND checkout_request_id = ?2
          AND status IN ('reserved', 'checkout_created', 'converted')`,
    )
      .bind(reservationId, checkoutRequestId)
      .first<{
        id: string;
        checkout_request_id: string;
        stripe_checkout_session_id: string | null;
        status: string;
      }>();
    if (!reservation || (reservation.stripe_checkout_session_id && reservation.stripe_checkout_session_id !== session.id)) {
      throw new ApiError(409, "founding_reservation_mismatch", "The founding reservation is invalid.");
    }
  }

  const paidAt = new Date(event.created * 1000);
  const paidAtIso = paidAt.toISOString();
  const receivedAt = new Date().toISOString();
  const customerId = crypto.randomUUID();
  const purchaseId = crypto.randomUUID();
  const entitlementId = crypto.randomUUID();
  const expiration = addPlanDuration(paidAt, plan);
  const priceId = checkout.stripe_price_id;
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO stripe_webhook_events (
         stripe_event_id, event_type, status, attempts, stripe_created_at,
         first_received_at, last_received_at, processed_at
       ) VALUES (?1, ?2, 'received', 1, ?3, ?4, ?4, NULL)
       ON CONFLICT(stripe_event_id) DO UPDATE SET
         attempts = stripe_webhook_events.attempts + 1,
         last_received_at = excluded.last_received_at`,
    ).bind(event.id, event.type, paidAtIso, receivedAt),
    env.DB.prepare(
      `UPDATE checkout_requests
          SET stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, ?1),
              status = 'completed', updated_at = ?2
        WHERE id = ?3`,
    ).bind(session.id, receivedAt, checkoutRequestId),
  ];
  if (plan === "FOUNDING_LIFETIME") {
    statements.push(
      env.DB.prepare(
        `UPDATE founding_reservations
            SET stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, ?1),
                status = CASE WHEN status = 'reserved' THEN 'checkout_created' ELSE status END
          WHERE id = ?2`,
      ).bind(session.id, checkout.founding_reservation_id),
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO customers (
         id, email, email_normalized, stripe_customer_id, created_at, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(email_normalized) DO UPDATE SET
         email = excluded.email,
         stripe_customer_id = COALESCE(excluded.stripe_customer_id, customers.stripe_customer_id),
         updated_at = excluded.updated_at`,
    ).bind(customerId, email.email, email.normalized, session.customer ?? null, receivedAt),
    env.DB.prepare(
      `INSERT OR IGNORE INTO purchases (
         id, customer_id, stripe_checkout_session_id, stripe_payment_intent_id,
         stripe_price_id, plan, amount_minor, currency, status,
         last_stripe_event_created, paid_at, created_at, updated_at
       )
       SELECT ?1, c.id, ?2, ?3, ?4, ?5, ?6, ?7, 'paid', ?8, ?9, ?10, ?10
         FROM customers c WHERE c.email_normalized = ?11`,
    ).bind(
      purchaseId,
      session.id,
      session.payment_intent ?? null,
      priceId,
      plan,
      expected.amountMinor,
      expected.currency,
      event.created,
      paidAtIso,
      receivedAt,
      email.normalized,
    ),
    env.DB.prepare(
      `INSERT OR IGNORE INTO entitlements (
         id, customer_id, purchase_id, plan, starts_at, expires_at, revoked_at, created_at
       )
       SELECT ?1, p.customer_id, p.id, p.plan, ?2, ?3, NULL, ?4
         FROM purchases p WHERE p.stripe_checkout_session_id = ?5`,
    ).bind(
      entitlementId,
      paidAtIso,
      expiration?.toISOString() ?? null,
      receivedAt,
      session.id,
    ),
  );
  if (plan === "FOUNDING_LIFETIME") {
    statements.push(
      env.DB.prepare(
        `UPDATE founding_reservations
            SET status = 'converted', converted_at = COALESCE(converted_at, ?1)
          WHERE id = ?2`,
      ).bind(receivedAt, checkout.founding_reservation_id),
    );
  }
  statements.push(
    env.DB.prepare(
      `UPDATE stripe_webhook_events
          SET status = 'succeeded', processed_at = ?1
        WHERE stripe_event_id = ?2`,
    ).bind(receivedAt, event.id),
  );
  await env.DB.batch(statements);
}

async function recordWebhookOnly(env: Env, event: StripeEvent): Promise<void> {
  const receivedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO stripe_webhook_events (
       stripe_event_id, event_type, status, attempts, stripe_created_at,
       first_received_at, last_received_at, processed_at
     ) VALUES (?1, ?2, 'succeeded', 1, ?3, ?4, ?4, ?4)
     ON CONFLICT(stripe_event_id) DO UPDATE SET
       attempts = stripe_webhook_events.attempts + 1,
       last_received_at = excluded.last_received_at`,
  )
    .bind(event.id, event.type, new Date(event.created * 1000).toISOString(), receivedAt)
    .run();
}

export async function verifyStripeSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<void> {
  if (!signatureHeader) {
    throw new ApiError(400, "missing_stripe_signature", "Stripe-Signature is required.");
  }
  const values = signatureHeader.split(",").map((part) => part.trim().split("=", 2));
  const timestampText = values.find(([key]) => key === "t")?.[1];
  const signatures = values.filter(([key]) => key === "v1").map(([, value]) => value ?? "");
  const timestamp = Number(timestampText);
  if (
    !Number.isInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS ||
    signatures.length === 0
  ) {
    throw new ApiError(400, "invalid_stripe_signature", "The Stripe signature is invalid.");
  }
  const expected = await hmacSha256(secret, `${timestamp}.${payload}`);
  const matches = signatures.some((candidate) => {
    const supplied = hexToBytes(candidate);
    return supplied !== null && timingSafeEqual(expected, supplied);
  });
  if (!matches) {
    throw new ApiError(400, "invalid_stripe_signature", "The Stripe signature is invalid.");
  }
}

async function stripeRequest<T>(
  env: Env,
  path: string,
  options: { method: "POST" | "GET"; body?: URLSearchParams; idempotencyKey?: string },
): Promise<T> {
  const headers = new Headers({
    authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "stripe-version": STRIPE_API_VERSION,
  });
  if (options.body) headers.set("content-type", "application/x-www-form-urlencoded");
  if (options.idempotencyKey) headers.set("idempotency-key", options.idempotencyKey);
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: options.method,
    headers,
    body: options.body?.toString(),
  });
  const data = (await response.json()) as { error?: { message?: string } } & T;
  if (!response.ok) {
    console.error("stripe_request_failed", { status: response.status });
    throw new ApiError(
      502,
      "stripe_unavailable",
      data.error?.message ?? "Stripe Checkout is temporarily unavailable.",
    );
  }
  return data;
}

async function validateStripePrice(
  env: Env,
  priceId: string,
  plan: string,
): Promise<void> {
  const price = await stripeRequest<StripePrice>(
    env,
    `/v1/prices/${encodeURIComponent(priceId)}`,
    { method: "GET" },
  );
  const expected = PERSONAL_PLANS[plan];
  if (
    price.id !== priceId ||
    !price.active ||
    price.type !== "one_time" ||
    price.currency?.toLowerCase() !== expected.currency ||
    price.unit_amount !== expected.amountMinor
  ) {
    console.error("stripe_price_misconfigured", { plan, priceId });
    throw new ApiError(
      503,
      "billing_not_configured",
      "This plan’s Stripe Price does not match its published terms.",
    );
  }
}

// ✅ UPDATED: Handles all 5 Stripe Price IDs
function stripePriceId(env: Env, plan: string): string {
  const value = (() => {
    switch (plan) {
      case "ONE_EVENT": return env.STRIPE_PRICE_ONE_EVENT;
      case "PERSONAL_6_MONTH": return env.STRIPE_PRICE_PERSONAL_6_MONTH;
      case "PERSONAL_12_MONTH": return env.STRIPE_PRICE_PERSONAL_12_MONTH;
      case "FOUNDING_LIFETIME": return env.STRIPE_PRICE_FOUNDING_LIFETIME;
      case "BUSINESS": return env.STRIPE_PRICE_BUSINESS;
      default: return "price_replace_me";
    }
  })();
  if (!value || !value.startsWith("price_") || value === "price_replace_me") {
    throw new ApiError(503, "billing_not_configured", "This plan is not configured yet.");
  }
  return value;
}

function checkoutRecordResponse(record: CheckoutRecord): Response {
  if (record.status === "completed") {
    throw new ApiError(
      409,
      "checkout_completed",
      "This Checkout was already paid. Restore the entitlement instead of paying again.",
    );
  }
  if (record.status === "expired") {
    throw new ApiError(410, "checkout_expired", "This Checkout expired. Start again.");
  }
  if (record.status === "failed") {
    throw new ApiError(
      409,
      record.last_error_code ?? "checkout_failed",
      "This Checkout could not be created. Start again with a new Idempotency-Key.",
    );
  }
  if (!record.stripe_checkout_session_id || !record.stripe_checkout_url) {
    throw new ApiError(
      409,
      "checkout_in_progress",
      "That Checkout request is still being prepared. Retry with the same key shortly.",
    );
  }
  return json({
    checkoutSessionId: record.stripe_checkout_session_id,
    checkoutUrl: record.stripe_checkout_url,
    plan: record.plan,
    entitlementPending: true,
    idempotentReplay: true,
  });
}

function appOrigin(env: Env): string {
  let url: URL;
  try {
    url = new URL(env.PUBLIC_APP_ORIGIN);
  } catch {
    throw new ApiError(503, "app_origin_not_configured", "The app origin is not configured.");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new ApiError(503, "app_origin_not_secure", "The app origin must use HTTPS.");
  }
  return url.origin;
}

function requireConfiguredSecret(value: string, name: string): void {
  if (!value || value.includes("replace_me") || value.length < 16) {
    throw new ApiError(503, "service_not_configured", `${name} is not configured.`);
  }
}

function expectedStripeLiveMode(env: Env): boolean {
  if (env.STRIPE_EXPECTED_LIVEMODE === "true") return true;
  if (env.STRIPE_EXPECTED_LIVEMODE === "true") {
    if (env.ENVIRONMENT === "production") {
      throw new ApiError(503, "stripe_mode_not_configured", "Production must use Stripe live mode.");
    }
    return false;
  }
  throw new ApiError(
    503,
    "stripe_mode_not_configured",
    "STRIPE_EXPECTED_LIVEMODE must be explicitly true or false.",
  );
}

function validateStripeKeyMode(env: Env, liveMode: boolean): void {
  const prefixes = liveMode ? ["sk_live_", "rk_live_"] : ["sk_test_", "rk_test_"];
  if (isUnsafeSecret(env.STRIPE_SECRET_KEY) || !prefixes.some((prefix) => env.STRIPE_SECRET_KEY.startsWith(prefix))) {
    throw new ApiError(503, "stripe_mode_not_configured", "The Stripe key does not match the configured mode.");
  }
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  const result = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    result[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return result;
}