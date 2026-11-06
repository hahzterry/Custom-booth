import {
  issueGuestSessionToken,
  requireBusiness,
  requireGuestSession,
  requireOwnedEvent,
  requirePlatformAdmin,
  requirePublicEvent,
} from "./auth";
import { randomToken, sha256Hex } from "./crypto";
import {
  ApiError,
  json,
  normaliseEmail,
  optionalString,
  readJson,
  requireBoolean,
  requireString,
} from "./http";
import { csvCell, validateBusinessConfig } from "./policy";
import type { BusinessEventConfig, BusinessEventRow, Env } from "./types";

interface EventBody {
  name?: unknown;
  eventDate?: unknown;
  brandName?: unknown;
  primaryColour?: unknown;
  secondaryColour?: unknown;
  welcomeHeading?: unknown;
  welcomeCta?: unknown;
  welcomeHint?: unknown;
  status?: unknown;
  whiteLabel?: unknown;
  config?: Partial<Record<keyof BusinessEventConfig, unknown>>;
}

interface AttendeeBody {
  email?: unknown;
  marketingConsent?: unknown;
  photoUseConsent?: unknown;
  consentWordingVersion?: unknown;
}

export async function createOrganisation(request: Request, env: Env): Promise<Response> {
  await requirePlatformAdmin(request, env);
  const body = await readJson<{ name?: unknown; keyLabel?: unknown }>(request);
  const name = requireString(body.name, "name", { min: 2, max: 120 });
  const keyLabel = optionalString(body.keyLabel, "keyLabel", 80) ?? "Primary key";
  const organisationId = crypto.randomUUID();
  const keyId = crypto.randomUUID();
  const apiKey = randomToken("mbb_bus_", 32);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO business_organisations (id, name, status, created_at, updated_at)
       VALUES (?1, ?2, 'active', ?3, ?3)`,
    ).bind(organisationId, name, now),
    env.DB.prepare(
      `INSERT INTO business_api_keys (
         id, organisation_id, key_prefix, key_hash, label, created_at,
         last_used_at, revoked_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL)`,
    ).bind(keyId, organisationId, apiKey.slice(0, 16), await sha256Hex(apiKey), keyLabel, now),
  ]);
  return json(
    {
      organisation: { id: organisationId, name, status: "active" },
      apiKey,
      warning: "This Business API key is shown once. Store it securely.",
    },
    201,
  );
}

export async function listEvents(request: Request, env: Env): Promise<Response> {
  const principal = await requireBusiness(request, env);
  const rows = await env.DB.prepare(
    `SELECT * FROM business_events
      WHERE organisation_id = ?1
      ORDER BY created_at DESC`,
  )
    .bind(principal.organisationId)
    .all<BusinessEventRow>();
  return json({ events: (rows.results ?? []).map(eventForBusiness) });
}

export async function createEvent(request: Request, env: Env): Promise<Response> {
  const principal = await requireBusiness(request, env);
  const body = await readJson<EventBody>(request);
  const name = requireString(body.name, "name", { min: 2, max: 120 });
  const organisation = await env.DB.prepare(
    "SELECT name FROM business_organisations WHERE id = ?1",
  )
    .bind(principal.organisationId)
    .first<{ name: string }>();
  if (!organisation) throw new ApiError(404, "organisation_not_found", "Organisation not found.");
  const brandName = optionalString(body.brandName, "brandName", 100) ?? organisation.name;
  const config = parseConfig(body.config, defaultConfig(brandName));
  assertValidConfig(config);
  const eventId = crypto.randomUUID();
  const publicId = crypto.randomUUID();
  const publicToken = randomToken("mbb_evt_", 32);
  const now = new Date().toISOString();
  const eventDate = parseDate(body.eventDate);
  const primaryColour = parseColour(body.primaryColour, "primaryColour", "#ff4f8b");
  const secondaryColour = parseColour(body.secondaryColour, "secondaryColour", "#111111");
  const welcomeHeading = optionalString(body.welcomeHeading, "welcomeHeading", 160) ?? name;
  const welcomeCta = optionalString(body.welcomeCta, "welcomeCta", 40) ?? "START";
  const welcomeHint = optionalString(body.welcomeHint, "welcomeHint", 80) ?? "tap to begin";

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO business_events (
         id, organisation_id, public_id, public_access_token_hash, name,
         event_date, brand_name, primary_colour, secondary_colour,
         welcome_heading, welcome_cta, welcome_hint, status,
         allow_share, allow_download, delivery_mode, collect_email,
         require_email_before_completion, marketing_consent_enabled,
         photo_use_consent_enabled, collect_consented_photos,
         marketing_consent_wording, photo_use_consent_wording,
         consent_wording_version, white_label, active_logo_asset_id,
         created_at, updated_at
       ) VALUES (
         ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'draft',
         ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, 1, 0, NULL,
         ?23, ?23
       )`,
    ).bind(
      eventId,
      principal.organisationId,
      publicId,
      await sha256Hex(publicToken),
      name,
      eventDate,
      brandName,
      primaryColour,
      secondaryColour,
      welcomeHeading,
      welcomeCta,
      welcomeHint,
      boolInt(config.allowShare),
      boolInt(config.allowDownload),
      config.deliveryMode,
      boolInt(config.collectEmail),
      boolInt(config.requireEmailBeforeCompletion),
      boolInt(config.marketingConsentEnabled),
      boolInt(config.photoUseConsentEnabled),
      boolInt(config.collectConsentedPhotos),
      config.marketingConsentWording,
      config.photoUseConsentWording,
      now,
    ),
    consentVersionStatement(env, eventId, 1, config, now),
  ]);
  const event = await requireOwnedEvent(env, principal.organisationId, eventId);
  return json(
    {
      event: eventForBusiness(event),
      publicAccess: {
        publicId,
        eventToken: publicToken,
        warning: "Treat this as an event-scoped booth credential and rotate it if exposed outside the event.",
      },
    },
    201,
  );
}

export async function getEvent(
  request: Request,
  env: Env,
  eventId: string,
): Promise<Response> {
  const principal = await requireBusiness(request, env);
  return json({ event: eventForBusiness(await requireOwnedEvent(env, principal.organisationId, eventId)) });
}

export async function updateEvent(
  request: Request,
  env: Env,
  eventId: string,
): Promise<Response> {
  const principal = await requireBusiness(request, env);
  const current = await requireOwnedEvent(env, principal.organisationId, eventId);
  const body = await readJson<EventBody>(request);
  const currentConfig = configFromRow(current);
  const nextConfig = parseConfig(body.config, currentConfig);
  assertValidConfig(nextConfig);
  const name = body.name === undefined ? current.name : requireString(body.name, "name", { max: 120 });
  const brandName = body.brandName === undefined
    ? current.brand_name
    : requireString(body.brandName, "brandName", { max: 100 });
  const eventDate = body.eventDate === undefined ? current.event_date : parseDate(body.eventDate);
  const primaryColour = body.primaryColour === undefined
    ? current.primary_colour
    : parseColour(body.primaryColour, "primaryColour");
  const secondaryColour = body.secondaryColour === undefined
    ? current.secondary_colour
    : parseColour(body.secondaryColour, "secondaryColour");
  const welcomeHeading = body.welcomeHeading === undefined
    ? current.welcome_heading
    : requireString(body.welcomeHeading, "welcomeHeading", { max: 160 });
  const welcomeCta = body.welcomeCta === undefined
    ? current.welcome_cta
    : requireString(body.welcomeCta, "welcomeCta", { max: 40 });
  const welcomeHint = body.welcomeHint === undefined
    ? current.welcome_hint
    : requireString(body.welcomeHint, "welcomeHint", { max: 80 });
  const status = body.status === undefined ? current.status : parseStatus(body.status);
  const whiteLabel = body.whiteLabel === undefined
    ? current.white_label === 1
    : requireBoolean(body.whiteLabel, "whiteLabel");
  const consentChanged = consentFieldsChanged(currentConfig, nextConfig);
  const consentVersion = current.consent_wording_version + (consentChanged ? 1 : 0);
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `UPDATE business_events SET
         name = ?1, event_date = ?2, brand_name = ?3,
         primary_colour = ?4, secondary_colour = ?5,
         welcome_heading = ?6, welcome_cta = ?7, welcome_hint = ?8,
         status = ?9, allow_share = ?10, allow_download = ?11,
         delivery_mode = ?12, collect_email = ?13,
         require_email_before_completion = ?14,
         marketing_consent_enabled = ?15, photo_use_consent_enabled = ?16,
         collect_consented_photos = ?17, marketing_consent_wording = ?18,
         photo_use_consent_wording = ?19, consent_wording_version = ?20,
         white_label = ?21, updated_at = ?22
       WHERE id = ?23 AND organisation_id = ?24`,
    ).bind(
      name,
      eventDate,
      brandName,
      primaryColour,
      secondaryColour,
      welcomeHeading,
      welcomeCta,
      welcomeHint,
      status,
      boolInt(nextConfig.allowShare),
      boolInt(nextConfig.allowDownload),
      nextConfig.deliveryMode,
      boolInt(nextConfig.collectEmail),
      boolInt(nextConfig.requireEmailBeforeCompletion),
      boolInt(nextConfig.marketingConsentEnabled),
      boolInt(nextConfig.photoUseConsentEnabled),
      boolInt(nextConfig.collectConsentedPhotos),
      nextConfig.marketingConsentWording,
      nextConfig.photoUseConsentWording,
      consentVersion,
      boolInt(whiteLabel),
      now,
      eventId,
      principal.organisationId,
    ),
  ];
  if (consentChanged) {
    statements.push(consentVersionStatement(env, eventId, consentVersion, nextConfig, now));
  }
  await env.DB.batch(statements);
  return json({
    event: eventForBusiness(await requireOwnedEvent(env, principal.organisationId, eventId)),
  });
}

export async function rotateEventToken(
  request: Request,
  env: Env,
  eventId: string,
): Promise<Response> {
  const principal = await requireBusiness(request, env);
  await requireOwnedEvent(env, principal.organisationId, eventId);
  const eventToken = randomToken("mbb_evt_", 32);
  await env.DB.prepare(
    `UPDATE business_events
        SET public_access_token_hash = ?1, updated_at = ?2
      WHERE id = ?3 AND organisation_id = ?4`,
  )
    .bind(
      await sha256Hex(eventToken),
      new Date().toISOString(),
      eventId,
      principal.organisationId,
    )
    .run();
  return json({
    eventId,
    eventToken,
    warning: "The previous event credential is now invalid. This token is shown once.",
  });
}

export async function publicEventConfig(
  request: Request,
  env: Env,
  publicId: string,
): Promise<Response> {
  const event = await requirePublicEvent(request, env, publicId);
  return json({ event: eventForGuest(event) });
}

export async function createGuestSession(
  request: Request,
  env: Env,
  publicId: string,
): Promise<Response> {
  const event = await requirePublicEvent(request, env, publicId);
  if (event.status !== "live") {
    throw new ApiError(409, "event_not_live", "This event is not accepting guest sessions.");
  }
  const sessionId = crypto.randomUUID();
  const issued = await issueGuestSessionToken(env, event.id, sessionId);
  return json({ sessionId, sessionToken: issued.token, expiresAt: issued.expiresAt }, 201);
}

export async function recordAttendee(
  request: Request,
  env: Env,
  publicId: string,
): Promise<Response> {
  const event = await requirePublicEvent(request, env, publicId);
  if (event.status !== "live") {
    throw new ApiError(409, "event_not_live", "This event is not accepting attendee records.");
  }
  const guest = await requireGuestSession(request, env, event.id);
  const body = await readJson<AttendeeBody>(request);

  let email: { email: string; normalized: string } | null = null;
  if (event.collect_email === 1) {
    if (body.email !== undefined && body.email !== null && body.email !== "") {
      email = normaliseEmail(body.email);
    } else if (event.require_email_before_completion === 1) {
      throw new ApiError(400, "email_required", "An email address is required for this event.");
    }
  } else if (body.email !== undefined && body.email !== null && body.email !== "") {
    throw new ApiError(400, "email_collection_disabled", "This event does not collect email addresses.");
  }

  const marketingConsent = consentDecision(
    event.marketing_consent_enabled === 1,
    body.marketingConsent,
    "marketingConsent",
  );
  const photoUseConsent = consentDecision(
    event.photo_use_consent_enabled === 1,
    body.photoUseConsent,
    "photoUseConsent",
  );
  if (marketingConsent === true && email === null) {
    throw new ApiError(
      400,
      "email_required_for_marketing_consent",
      "An email address is required when marketing consent is granted.",
    );
  }
  const anyConsentPresented =
    event.marketing_consent_enabled === 1 || event.photo_use_consent_enabled === 1;
  if (
    anyConsentPresented &&
    (!Number.isInteger(body.consentWordingVersion) ||
      body.consentWordingVersion !== event.consent_wording_version)
  ) {
    throw new ApiError(
      409,
      "stale_consent_wording",
      "The consent wording changed. Reload it before recording a decision.",
    );
  }

  const attendeeId = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO attendees (
         id, event_id, guest_session_id, email, email_normalized,
         email_collected_at, marketing_consent, photo_use_consent,
         consent_wording_version, marketing_consent_wording,
         photo_use_consent_wording, consent_timestamp,
         photo_use_consent_revoked_at, created_at
       ) VALUES (
         ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, NULL, ?13
       )`,
    )
      .bind(
        attendeeId,
        event.id,
        guest.sessionId,
        email?.email ?? null,
        email?.normalized ?? null,
        email ? now : null,
        marketingConsent === null ? null : boolInt(marketingConsent),
        photoUseConsent === null ? null : boolInt(photoUseConsent),
        anyConsentPresented ? event.consent_wording_version : null,
        event.marketing_consent_enabled === 1 ? event.marketing_consent_wording : null,
        event.photo_use_consent_enabled === 1 ? event.photo_use_consent_wording : null,
        anyConsentPresented ? now : null,
        now,
      )
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new ApiError(409, "attendee_already_recorded", "This guest session is already recorded.");
    }
    throw error;
  }
  return json(
    {
      attendeeId,
      guestSessionId: guest.sessionId,
      emailCollected: email !== null,
      marketingConsent,
      photoUseConsent,
      consentWordingVersion: anyConsentPresented ? event.consent_wording_version : null,
      photoCollectionEligible:
        event.collect_consented_photos === 1 && photoUseConsent === true,
    },
    201,
  );
}

export async function exportAttendeesCsv(
  request: Request,
  env: Env,
  eventId: string,
): Promise<Response> {
  const principal = await requireBusiness(request, env);
  const event = await requireOwnedEvent(env, principal.organisationId, eventId);
  const rows = await env.DB.prepare(
    `SELECT
       a.id, a.event_id, a.guest_session_id, a.email, a.email_collected_at,
       a.marketing_consent, a.photo_use_consent, a.photo_use_consent_revoked_at,
       a.consent_wording_version, a.marketing_consent_wording,
       a.photo_use_consent_wording, a.consent_timestamp, a.created_at,
       (SELECT GROUP_CONCAT(go.id, ';') FROM guest_outputs go
         WHERE go.attendee_id = a.id AND go.deleted_at IS NULL) AS collected_output_references
     FROM attendees a
     WHERE a.event_id = ?1
     ORDER BY a.created_at ASC`,
  )
    .bind(eventId)
    .all<Record<string, unknown>>();
  const columns = [
    "event_id",
    "attendee_id",
    "guest_session_id",
    "email",
    "email_collected_at",
    "marketing_consent",
    "photo_use_consent",
    "consent_wording_version",
    "marketing_consent_wording",
    "photo_use_consent_wording",
    "consent_timestamp",
    "attendee_created_at",
    "collected_output_references",
  ];
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows.results ?? []) {
    lines.push(
      [
        row.event_id,
        row.id,
        row.guest_session_id,
        row.email,
        row.email_collected_at,
        consentLabel(row.marketing_consent, null),
        consentLabel(row.photo_use_consent, row.photo_use_consent_revoked_at),
        row.consent_wording_version,
        row.marketing_consent_wording,
        row.photo_use_consent_wording,
        row.consent_timestamp,
        row.created_at,
        row.collected_output_references,
      ].map(csvCell).join(","),
    );
  }
  const filename = `${slug(event.name) || "event"}-attendees.csv`;
  return new Response(`${lines.join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function revokePhotoConsent(
  request: Request,
  env: Env,
  eventId: string,
  attendeeId: string,
): Promise<Response> {
  const principal = await requireBusiness(request, env);
  await requireOwnedEvent(env, principal.organisationId, eventId);
  const result = await env.DB.prepare(
    `UPDATE attendees
        SET photo_use_consent_revoked_at = ?1
      WHERE id = ?2 AND event_id = ?3 AND photo_use_consent = 1
        AND photo_use_consent_revoked_at IS NULL`,
  )
    .bind(new Date().toISOString(), attendeeId, eventId)
    .run();
  if ((result.meta.changes ?? 0) !== 1) {
    throw new ApiError(404, "active_consent_not_found", "No active photo-use consent was found.");
  }
  return json({ revoked: true });
}

function defaultConfig(brandName: string): BusinessEventConfig {
  return {
    allowShare: true,
    allowDownload: true,
    deliveryMode: "immediate",
    collectEmail: false,
    requireEmailBeforeCompletion: false,
    marketingConsentEnabled: false,
    photoUseConsentEnabled: false,
    collectConsentedPhotos: false,
    marketingConsentWording: `I’d like to hear about news and offers from ${brandName}.`,
    photoUseConsentWording: `I give ${brandName} permission to use my photographs from this event for promotional purposes.`,
  };
}

function parseConfig(
  input: EventBody["config"],
  fallback: BusinessEventConfig,
): BusinessEventConfig {
  if (input !== undefined && (typeof input !== "object" || input === null || Array.isArray(input))) {
    throw new ApiError(400, "invalid_request", "config must be an object.");
  }
  const source = input ?? {};
  return {
    allowShare: optionalBoolean(source.allowShare, "config.allowShare", fallback.allowShare),
    allowDownload: optionalBoolean(source.allowDownload, "config.allowDownload", fallback.allowDownload),
    deliveryMode: source.deliveryMode === undefined
      ? fallback.deliveryMode
      : parseDeliveryMode(source.deliveryMode),
    collectEmail: optionalBoolean(source.collectEmail, "config.collectEmail", fallback.collectEmail),
    requireEmailBeforeCompletion: optionalBoolean(
      source.requireEmailBeforeCompletion,
      "config.requireEmailBeforeCompletion",
      fallback.requireEmailBeforeCompletion,
    ),
    marketingConsentEnabled: optionalBoolean(
      source.marketingConsentEnabled,
      "config.marketingConsentEnabled",
      fallback.marketingConsentEnabled,
    ),
    photoUseConsentEnabled: optionalBoolean(
      source.photoUseConsentEnabled,
      "config.photoUseConsentEnabled",
      fallback.photoUseConsentEnabled,
    ),
    collectConsentedPhotos: optionalBoolean(
      source.collectConsentedPhotos,
      "config.collectConsentedPhotos",
      fallback.collectConsentedPhotos,
    ),
    marketingConsentWording: source.marketingConsentWording === undefined
      ? fallback.marketingConsentWording
      : optionalString(source.marketingConsentWording, "config.marketingConsentWording", 1_000),
    photoUseConsentWording: source.photoUseConsentWording === undefined
      ? fallback.photoUseConsentWording
      : optionalString(source.photoUseConsentWording, "config.photoUseConsentWording", 1_000),
  };
}

function configFromRow(row: BusinessEventRow): BusinessEventConfig {
  return {
    allowShare: row.allow_share === 1,
    allowDownload: row.allow_download === 1,
    deliveryMode: row.delivery_mode,
    collectEmail: row.collect_email === 1,
    requireEmailBeforeCompletion: row.require_email_before_completion === 1,
    marketingConsentEnabled: row.marketing_consent_enabled === 1,
    photoUseConsentEnabled: row.photo_use_consent_enabled === 1,
    collectConsentedPhotos: row.collect_consented_photos === 1,
    marketingConsentWording: row.marketing_consent_wording,
    photoUseConsentWording: row.photo_use_consent_wording,
  };
}

function assertValidConfig(config: BusinessEventConfig): void {
  const errors = validateBusinessConfig(config);
  if (errors.length) throw new ApiError(400, "invalid_event_config", errors[0]!, errors);
}

function eventForBusiness(event: BusinessEventRow): Record<string, unknown> {
  return {
    id: event.id,
    publicId: event.public_id,
    name: event.name,
    eventDate: event.event_date,
    brandName: event.brand_name,
    primaryColour: event.primary_colour,
    secondaryColour: event.secondary_colour,
    welcomeHeading: event.welcome_heading,
    welcomeCta: event.welcome_cta,
    welcomeHint: event.welcome_hint,
    status: event.status,
    whiteLabel: event.white_label === 1,
    activeLogoAssetId: event.active_logo_asset_id,
    consentWordingVersion: event.consent_wording_version,
    config: configFromRow(event),
    createdAt: event.created_at,
    updatedAt: event.updated_at,
  };
}

function eventForGuest(event: BusinessEventRow): Record<string, unknown> {
  return {
    publicId: event.public_id,
    name: event.name,
    eventDate: event.event_date,
    brandName: event.brand_name,
    primaryColour: event.primary_colour,
    secondaryColour: event.secondary_colour,
    welcomeHeading: event.welcome_heading,
    welcomeCta: event.welcome_cta,
    welcomeHint: event.welcome_hint,
    allowShare: event.allow_share === 1,
    allowDownload: event.allow_download === 1,
    deliveryMode: event.delivery_mode,
    collectEmail: event.collect_email === 1,
    requireEmailBeforeCompletion: event.require_email_before_completion === 1,
    marketingConsent: event.marketing_consent_enabled === 1
      ? { enabled: true, wording: event.marketing_consent_wording }
      : { enabled: false },
    photoUseConsent: event.photo_use_consent_enabled === 1
      ? { enabled: true, wording: event.photo_use_consent_wording }
      : { enabled: false },
    collectConsentedPhotos: event.collect_consented_photos === 1,
    consentWordingVersion: event.consent_wording_version,
    logoAvailable: event.active_logo_asset_id !== null,
  };
}

function consentVersionStatement(
  env: Env,
  eventId: string,
  version: number,
  config: BusinessEventConfig,
  now: string,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO event_consent_versions (
       event_id, version, marketing_consent_enabled,
       photo_use_consent_enabled, marketing_consent_wording,
       photo_use_consent_wording, created_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  ).bind(
    eventId,
    version,
    boolInt(config.marketingConsentEnabled),
    boolInt(config.photoUseConsentEnabled),
    config.marketingConsentWording,
    config.photoUseConsentWording,
    now,
  );
}

function consentFieldsChanged(left: BusinessEventConfig, right: BusinessEventConfig): boolean {
  return (
    left.marketingConsentEnabled !== right.marketingConsentEnabled ||
    left.photoUseConsentEnabled !== right.photoUseConsentEnabled ||
    left.marketingConsentWording !== right.marketingConsentWording ||
    left.photoUseConsentWording !== right.photoUseConsentWording
  );
}

function consentDecision(enabled: boolean, value: unknown, field: string): boolean | null {
  if (!enabled) {
    if (value === true) {
      throw new ApiError(400, "consent_not_offered", `${field} is not offered at this event.`);
    }
    return null;
  }
  return requireBoolean(value, field);
}

function parseDate(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const date = requireString(value, "eventDate", { min: 10, max: 10 });
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new ApiError(400, "invalid_event_date", "eventDate must be YYYY-MM-DD.");
  }
  return date;
}

function parseColour(value: unknown, field: string, fallback?: string): string {
  if (value === undefined && fallback) return fallback;
  const colour = requireString(value, field, { min: 7, max: 7 }).toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(colour)) {
    throw new ApiError(400, "invalid_colour", `${field} must be a six-digit hex colour.`);
  }
  return colour;
}

function parseStatus(value: unknown): BusinessEventRow["status"] {
  if (value !== "draft" && value !== "live" && value !== "archived") {
    throw new ApiError(400, "invalid_status", "status must be draft, live, or archived.");
  }
  return value;
}

function parseDeliveryMode(value: unknown): BusinessEventConfig["deliveryMode"] {
  if (value !== "immediate" && value !== "email_gate" && value !== "configured") {
    throw new ApiError(
      400,
      "invalid_delivery_mode",
      "deliveryMode must be immediate, email_gate, or configured.",
    );
  }
  return value;
}

function optionalBoolean(value: unknown, field: string, fallback: boolean): boolean {
  return value === undefined ? fallback : requireBoolean(value, field);
}

function boolInt(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

function consentLabel(value: unknown, revokedAt: unknown): string {
  if (revokedAt) return "revoked";
  if (value === 1) return "granted";
  if (value === 0) return "declined";
  return "not_presented";
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
