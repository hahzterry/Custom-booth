import {
  createCheckout,
  currentEntitlement,
  foundingAvailability,
  requestEntitlementRestore,
  stripeWebhook,
  verifyEntitlementRestore,
} from "./billing";
import {
  createEvent,
  createGuestSession,
  createOrganisation,
  exportAttendeesCsv,
  getEvent,
  listEvents,
  publicEventConfig,
  recordAttendee,
  revokePhotoConsent,
  rotateEventToken,
  updateEvent,
} from "./business";
import { ApiError, corsHeaders, errorResponse, json, withCors } from "./http";
import type { Env } from "./types";
import { isUnsafeSecret } from "./policy";
import {
  authoriseBrandUpload,
  authoriseGuestOutputUpload,
  getPublicLogo,
  reconcilePendingUploads,
  uploadAsset,
} from "./uploads";

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    try {
      validateCoreConfiguration(env);
      await enforceRateLimits(request, env);
      const response = await route(request, env, context);
      const headers = new Headers(response.headers);
      headers.set("x-request-id", requestId);
      headers.set("referrer-policy", "no-referrer");
      headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
      return withCors(
        new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        }),
        request,
        env,
      );
    } catch (error) {
      if (!(error instanceof ApiError)) {
        console.error("request_failed", {
          requestId,
          method: request.method,
          path: new URL(request.url).pathname,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
      return withCors(errorResponse(error, requestId), request, env);
    }
  },
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    context: ExecutionContext,
  ): Promise<void> {
    validateCoreConfiguration(env);
    context.waitUntil(reconcilePendingUploads(env));
  },
};

async function route(
  request: Request,
  env: Env,
  context: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  const method = request.method.toUpperCase();

  if (method === "GET" && path === "/health") {
    return json({ ok: true, service: "mybishbash-photobooth-api" });
  }
  if (method === "POST" && path === "/v1/webhooks/stripe") {
    return stripeWebhook(request, env);
  }
  if (method === "POST" && path === "/v1/billing/checkout") {
    return createCheckout(request, env);
  }
  if (method === "GET" && path === "/v1/billing/founding") {
    return foundingAvailability(env);
  }
  if (method === "POST" && path === "/v1/entitlements/restore/request") {
    return requestEntitlementRestore(request, env, context);
  }
  if (method === "POST" && path === "/v1/entitlements/restore/verify") {
    return verifyEntitlementRestore(request, env);
  }
  if (method === "GET" && path === "/v1/entitlements/current") {
    return currentEntitlement(request, env);
  }

  if (method === "POST" && path === "/v1/admin/business/organisations") {
    return createOrganisation(request, env);
  }
  if (path === "/v1/business/events") {
    if (method === "GET") return listEvents(request, env);
    if (method === "POST") return createEvent(request, env);
  }

  let match = /^\/v1\/business\/events\/([^/]+)$/.exec(path);
  if (match?.[1]) {
    const eventId = safeSegment(match[1]);
    if (method === "GET") return getEvent(request, env, eventId);
    if (method === "PATCH") return updateEvent(request, env, eventId);
  }
  match = /^\/v1\/business\/events\/([^/]+)\/attendees\.csv$/.exec(path);
  if (method === "GET" && match?.[1]) {
    return exportAttendeesCsv(request, env, safeSegment(match[1]));
  }
  match = /^\/v1\/business\/events\/([^/]+)\/attendees\/([^/]+)\/revoke-photo-consent$/.exec(path);
  if (method === "POST" && match?.[1] && match[2]) {
    return revokePhotoConsent(
      request,
      env,
      safeSegment(match[1]),
      safeSegment(match[2]),
    );
  }
  match = /^\/v1\/business\/events\/([^/]+)\/brand-assets\/upload-authorisations$/.exec(path);
  if (method === "POST" && match?.[1]) {
    return authoriseBrandUpload(request, env, safeSegment(match[1]));
  }
  match = /^\/v1\/business\/events\/([^/]+)\/rotate-event-token$/.exec(path);
  if (method === "POST" && match?.[1]) {
    return rotateEventToken(request, env, safeSegment(match[1]));
  }

  match = /^\/v1\/public\/events\/([^/]+)$/.exec(path);
  if (method === "GET" && match?.[1]) {
    return publicEventConfig(request, env, safeSegment(match[1]));
  }
  match = /^\/v1\/public\/events\/([^/]+)\/sessions$/.exec(path);
  if (method === "POST" && match?.[1]) {
    return createGuestSession(request, env, safeSegment(match[1]));
  }
  match = /^\/v1\/public\/events\/([^/]+)\/attendees$/.exec(path);
  if (method === "POST" && match?.[1]) {
    return recordAttendee(request, env, safeSegment(match[1]));
  }
  match = /^\/v1\/public\/events\/([^/]+)\/guest-output-upload-authorisations$/.exec(path);
  if (method === "POST" && match?.[1]) {
    return authoriseGuestOutputUpload(request, env, safeSegment(match[1]));
  }
  match = /^\/v1\/public\/events\/([^/]+)\/logo$/.exec(path);
  if (method === "GET" && match?.[1]) {
    return getPublicLogo(request, env, safeSegment(match[1]));
  }

  match = /^\/v1\/uploads\/(brand_asset|guest_output)\/([^/]+)$/.exec(path);
  if (method === "PUT" && match?.[1] && match[2]) {
    return uploadAsset(
      request,
      env,
      match[1] as "brand_asset" | "guest_output",
      safeSegment(match[2]),
    );
  }

  throw new ApiError(404, "not_found", "The API route was not found.");
}

function safeSegment(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new ApiError(400, "invalid_path", "The URL path is invalid.");
  }
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(decoded)) {
    throw new ApiError(400, "invalid_path", "The URL path is invalid.");
  }
  return decoded;
}

function validateCoreConfiguration(env: Env): void {
  if (
    !env.DB ||
    !env.BRAND_ASSETS ||
    !env.CONSENTED_GUEST_OUTPUTS ||
    !env.ENTITLEMENT_EMAIL_QUEUE ||
    !env.CHECKOUT_RATE_LIMITER ||
    !env.PUBLIC_API_RATE_LIMITER
  ) {
    throw new ApiError(503, "service_not_configured", "Required Cloudflare bindings are missing.");
  }
  if (isUnsafeSecret(env.TOKEN_SIGNING_SECRET)) {
    throw new ApiError(503, "service_not_configured", "TOKEN_SIGNING_SECRET is not configured.");
  }
  if (isUnsafeSecret(env.PLATFORM_ADMIN_BEARER_TOKEN)) {
    throw new ApiError(
      503,
      "service_not_configured",
      "PLATFORM_ADMIN_BEARER_TOKEN is not configured.",
    );
  }
  if (env.TOKEN_SIGNING_SECRET === env.PLATFORM_ADMIN_BEARER_TOKEN) {
    throw new ApiError(503, "service_not_configured", "Service secrets must be distinct.");
  }
  if (
    env.STRIPE_EXPECTED_LIVEMODE !== "true" &&
    env.STRIPE_EXPECTED_LIVEMODE !== "false"
  ) {
    throw new ApiError(
      503,
      "service_not_configured",
      "STRIPE_EXPECTED_LIVEMODE must be explicitly true or false.",
    );
  }
  if (env.ENVIRONMENT === "production" && env.STRIPE_EXPECTED_LIVEMODE !== "true") {
    throw new ApiError(503, "service_not_configured", "Production must use Stripe live mode.");
  }
}

async function enforceRateLimits(request: Request, env: Env): Promise<void> {
  const path = new URL(request.url).pathname;
  const actor = request.headers.get("cf-connecting-ip") ?? "anonymous";
  if (
    path === "/v1/billing/checkout" ||
    path === "/v1/entitlements/restore/request"
  ) {
    const outcome = await env.CHECKOUT_RATE_LIMITER.limit({ key: `${path}:${actor}` });
    if (!outcome.success) {
      throw new ApiError(429, "rate_limited", "Too many requests. Please try again shortly.");
    }
  }
  if (
    path.startsWith("/v1/public/events/") &&
    request.method !== "GET"
  ) {
    const eventScope = path.split("/").slice(0, 5).join("/");
    const outcome = await env.PUBLIC_API_RATE_LIMITER.limit({
      key: `${eventScope}:${actor}`,
    });
    if (!outcome.success) {
      throw new ApiError(429, "rate_limited", "This event is receiving too many requests.");
    }
  }
}
