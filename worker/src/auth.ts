import {
  sha256Hex,
  signClaims,
  timingSafeEqualText,
  verifyClaims,
} from "./crypto";
import { ApiError, bearerToken } from "./http";
import { isUnsafeSecret } from "./policy";
import type {
  BusinessEventRow,
  BusinessPrincipal,
  Env,
  GuestSessionClaims,
  PersonalAccessClaims,
} from "./types";

export async function requirePlatformAdmin(request: Request, env: Env): Promise<void> {
  const supplied = bearerToken(request);
  if (
    isUnsafeSecret(env.PLATFORM_ADMIN_BEARER_TOKEN) ||
    !(await timingSafeEqualText(supplied, env.PLATFORM_ADMIN_BEARER_TOKEN))
  ) {
    throw new ApiError(403, "forbidden", "This operation requires platform access.");
  }
}

export async function requireBusiness(
  request: Request,
  env: Env,
): Promise<BusinessPrincipal> {
  const key = bearerToken(request);
  if (!key.startsWith("mbb_bus_") || key.length < 32) {
    throw new ApiError(401, "invalid_business_key", "The Business access key is invalid.");
  }
  const hash = await sha256Hex(key);
  const row = await env.DB.prepare(
    `SELECT k.id AS key_id, k.organisation_id
       FROM business_api_keys k
       JOIN business_organisations o ON o.id = k.organisation_id
      WHERE k.key_hash = ?1
        AND k.revoked_at IS NULL
        AND o.status = 'active'`,
  )
    .bind(hash)
    .first<{ key_id: string; organisation_id: string }>();
  if (!row) {
    throw new ApiError(401, "invalid_business_key", "The Business access key is invalid.");
  }
  await env.DB.prepare("UPDATE business_api_keys SET last_used_at = ?1 WHERE id = ?2")
    .bind(new Date().toISOString(), row.key_id)
    .run();
  return { organisationId: row.organisation_id, keyId: row.key_id };
}

export async function requireOwnedEvent(
  env: Env,
  organisationId: string,
  eventId: string,
): Promise<BusinessEventRow> {
  const event = await env.DB.prepare(
    "SELECT * FROM business_events WHERE id = ?1 AND organisation_id = ?2",
  )
    .bind(eventId, organisationId)
    .first<BusinessEventRow>();
  if (!event) {
    throw new ApiError(404, "event_not_found", "The Business event was not found.");
  }
  return event;
}

export async function requirePublicEvent(
  request: Request,
  env: Env,
  publicId: string,
): Promise<BusinessEventRow> {
  const supplied = request.headers.get("x-mybishbash-event-token") ?? "";
  if (!supplied.startsWith("mbb_evt_") || supplied.length < 32) {
    throw new ApiError(401, "invalid_event_token", "The event access token is invalid.");
  }
  const event = await env.DB.prepare(
    `SELECT e.*
       FROM business_events e
       JOIN business_organisations o ON o.id = e.organisation_id
      WHERE e.public_id = ?1
        AND e.status != 'archived'
        AND o.status = 'active'`,
  )
    .bind(publicId)
    .first<BusinessEventRow>();
  if (
    !event ||
    !(await timingSafeEqualText(await sha256Hex(supplied), event.public_access_token_hash))
  ) {
    throw new ApiError(401, "invalid_event_token", "The event access token is invalid.");
  }
  return event;
}

export async function issueGuestSessionToken(
  env: Env,
  eventId: string,
  sessionId: string,
): Promise<{ token: string; expiresAt: string }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 4 * 60 * 60;
  const claims: GuestSessionClaims = {
    purpose: "guest_session",
    eventId,
    sessionId,
    iat: now,
    exp,
  };
  return {
    token: await signClaims(claims, env.TOKEN_SIGNING_SECRET),
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export async function requireGuestSession(
  request: Request,
  env: Env,
  eventId: string,
): Promise<GuestSessionClaims> {
  const claims = await verifyClaims<GuestSessionClaims>(
    bearerToken(request),
    env.TOKEN_SIGNING_SECRET,
  );
  if (claims.purpose !== "guest_session" || claims.eventId !== eventId) {
    throw new ApiError(403, "wrong_token_scope", "The token does not belong to this event.");
  }
  return claims;
}

export async function requirePersonalAccess(
  request: Request,
  env: Env,
): Promise<PersonalAccessClaims> {
  const claims = await verifyClaims<PersonalAccessClaims>(
    bearerToken(request),
    env.TOKEN_SIGNING_SECRET,
  );
  if (claims.purpose !== "personal_access" || typeof claims.sub !== "string") {
    throw new ApiError(403, "wrong_token_scope", "The token cannot access entitlements.");
  }
  return claims;
}
