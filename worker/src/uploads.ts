import {
  requireBusiness,
  requireGuestSession,
  requireOwnedEvent,
  requirePublicEvent,
} from "./auth";
import { sha256Hex, signClaims, verifyClaims } from "./crypto";
import {
  ApiError,
  bearerToken,
  json,
  readJson,
  requireString,
} from "./http";
import {
  BRAND_CONTENT_TYPES,
  GUEST_OUTPUT_CONTENT_TYPES,
  MAX_BRAND_ASSET_BYTES,
  MAX_GUEST_OUTPUT_BYTES,
  MAX_GUEST_OUTPUTS_PER_ATTENDEE,
  MAX_GUEST_BYTES_PER_ATTENDEE,
  MAX_GUEST_OUTPUTS_PER_EVENT,
  MAX_GUEST_BYTES_PER_EVENT,
  isUnsafeSecret,
  mayCollectGuestOutput,
} from "./policy";
import type { Env, UploadClaims } from "./types";

interface UploadRequestBody {
  fileName?: unknown;
  contentType?: unknown;
  sizeBytes?: unknown;
  sha256?: unknown;
  kind?: unknown;
}

interface UploadAuthorisationRow {
  id: string;
  purpose: "brand_asset" | "guest_output";
  organisation_id: string;
  event_id: string;
  attendee_id: string | null;
  asset_kind: string;
  object_key: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  sha256_hex: string;
  expires_at: string;
  state: "authorised" | "uploading" | "stored" | "failed";
  claim_id: string | null;
  claim_expires_at: string | null;
  last_error_code: string | null;
  r2_etag: string | null;
  used_at: string | null;
}

interface GuestCollectionRow {
  collect_consented_photos: number;
  photo_use_consent_enabled: number;
  photo_use_consent: number | null;
  photo_use_consent_revoked_at: string | null;
  consent_wording_version: number | null;
  photo_use_consent_wording: string | null;
  consent_timestamp: string | null;
}

const BRAND_KINDS = new Set(["logo"]);
const GUEST_KINDS = new Set([
  "strip_png",
  "magazine_png",
  "polaroid_png",
  "polaroid_mp4",
]);

export async function authoriseBrandUpload(
  request: Request,
  env: Env,
  eventId: string,
): Promise<Response> {
  requireSigningSecret(env);
  const principal = await requireBusiness(request, env);
  await requireOwnedEvent(env, principal.organisationId, eventId);
  const body = await readJson<UploadRequestBody>(request);
  const kind = requireString(body.kind, "kind", { max: 40 });
  if (!BRAND_KINDS.has(kind)) {
    throw new ApiError(400, "invalid_brand_asset_kind", "Only logo assets are currently supported.");
  }
  const input = parseUploadRequest(body, BRAND_CONTENT_TYPES, MAX_BRAND_ASSET_BYTES);
  // SVG is intentionally excluded until a dedicated sanitizer and rasterized
  // rendering path exist. Accepting it as arbitrary XML would be unsafe.
  const authorisation = await createAuthorisation(env, {
    purpose: "brand_asset",
    organisationId: principal.organisationId,
    eventId,
    attendeeId: null,
    kind,
    ...input,
  });
  return uploadAuthorisationResponse(request, authorisation, 201);
}

export async function authoriseGuestOutputUpload(
  request: Request,
  env: Env,
  publicId: string,
): Promise<Response> {
  requireSigningSecret(env);
  const event = await requirePublicEvent(request, env, publicId);
  if (event.status !== "live") {
    throw new ApiError(409, "event_not_live", "This event is not accepting guest outputs.");
  }
  const guest = await requireGuestSession(request, env, event.id);
  const attendee = await env.DB.prepare(
    `SELECT
       a.id, a.photo_use_consent, a.photo_use_consent_revoked_at,
       a.consent_wording_version, a.photo_use_consent_wording,
       a.consent_timestamp, e.collect_consented_photos,
       e.photo_use_consent_enabled
     FROM attendees a
     JOIN business_events e ON e.id = a.event_id
     WHERE a.event_id = ?1 AND a.guest_session_id = ?2`,
  )
    .bind(event.id, guest.sessionId)
    .first<GuestCollectionRow & { id: string }>();
  if (!attendee) {
    throw new ApiError(
      409,
      "attendee_consent_required",
      "Record this guest’s event choices before requesting an upload.",
    );
  }
  assertGuestCollectionAllowed(attendee);
  const body = await readJson<UploadRequestBody>(request);
  const kind = requireString(body.kind, "kind", { max: 40 });
  if (!GUEST_KINDS.has(kind)) {
    throw new ApiError(400, "invalid_guest_output_kind", "Choose a supported rendered output type.");
  }
  const input = parseUploadRequest(body, GUEST_OUTPUT_CONTENT_TYPES, MAX_GUEST_OUTPUT_BYTES);
  const expectedType = kind === "polaroid_mp4" ? "video/mp4" : "image/png";
  if (input.contentType !== expectedType) {
    throw new ApiError(400, "content_type_mismatch", `${kind} must use ${expectedType}.`);
  }
  const authorisation = await createAuthorisation(env, {
    purpose: "guest_output",
    organisationId: event.organisation_id,
    eventId: event.id,
    attendeeId: attendee.id,
    kind,
    ...input,
  });
  return uploadAuthorisationResponse(request, authorisation, 201);
}

export async function uploadAsset(
  request: Request,
  env: Env,
  purpose: "brand_asset" | "guest_output",
  authorisationId: string,
): Promise<Response> {
  requireSigningSecret(env);
  const claims = await verifyClaims<UploadClaims>(
    bearerToken(request),
    env.TOKEN_SIGNING_SECRET,
  );
  if (
    claims.purpose !== purpose ||
    claims.authorisationId !== authorisationId
  ) {
    throw new ApiError(403, "wrong_token_scope", "The upload token cannot be used here.");
  }
  const authorisation = await env.DB.prepare(
    `SELECT * FROM upload_authorisations
      WHERE id = ?1 AND purpose = ?2`,
  )
    .bind(authorisationId, purpose)
    .first<UploadAuthorisationRow>();
  if (!authorisation) {
    throw new ApiError(404, "upload_not_found", "The upload authorisation was not found.");
  }
  if (authorisation.used_at || authorisation.state === "stored") {
    return existingUploadResponse(env, authorisation);
  }
  if (
    authorisation.state === "uploading" &&
    authorisation.claim_expires_at &&
    authorisation.claim_expires_at > new Date().toISOString()
  ) {
    throw new ApiError(409, "upload_in_progress", "This upload is already in progress.");
  }
  if (authorisation.state === "failed") {
    throw new ApiError(409, "upload_failed", "This upload authorisation cannot be reused.");
  }
  if (authorisation.expires_at <= new Date().toISOString()) {
    throw new ApiError(410, "upload_authorisation_expired", "The upload authorisation expired.");
  }
  const requestType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (requestType !== authorisation.content_type) {
    throw new ApiError(415, "content_type_mismatch", "The upload Content-Type does not match.");
  }
  const declaredSize = request.headers.get("content-length");
  if (declaredSize === null) {
    throw new ApiError(411, "content_length_required", "Content-Length is required for uploads.");
  }
  if (Number(declaredSize) !== authorisation.size_bytes) {
    throw new ApiError(400, "content_length_mismatch", "The upload size does not match.");
  }
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength !== authorisation.size_bytes) {
    throw new ApiError(400, "upload_size_mismatch", "The uploaded file size does not match.");
  }
  assertMagicBytes(buffer, authorisation.content_type);
  const actualHash = await sha256Hex(buffer);
  if (actualHash !== authorisation.sha256_hex) {
    throw new ApiError(400, "upload_hash_mismatch", "The uploaded file checksum does not match.");
  }

  let guestConsent: GuestCollectionRow | null = null;
  if (purpose === "guest_output") {
    guestConsent = await currentGuestConsent(env, authorisation);
    assertGuestCollectionAllowed(guestConsent);
    if (
      !guestConsent.consent_wording_version ||
      !guestConsent.photo_use_consent_wording ||
      !guestConsent.consent_timestamp ||
      !authorisation.attendee_id
    ) {
      throw new ApiError(409, "consent_record_incomplete", "The photo-use consent record is incomplete.");
    }
  } else {
    await assertActiveBrandScope(env, authorisation);
  }

  const claimId = crypto.randomUUID();
  const claimedAt = new Date();
  const claimExpiresAt = new Date(claimedAt.getTime() + 10 * 60 * 1000);
  const claim = await env.DB.prepare(
    `UPDATE upload_authorisations
        SET state = 'uploading', claim_id = ?1, claim_expires_at = ?2,
            last_error_code = NULL
      WHERE id = ?3 AND purpose = ?4 AND used_at IS NULL
        AND expires_at > ?5
        AND (
          state = 'authorised' OR
          (state = 'uploading' AND claim_expires_at <= ?5)
        )`,
  )
    .bind(
      claimId,
      claimExpiresAt.toISOString(),
      authorisation.id,
      purpose,
      claimedAt.toISOString(),
    )
    .run();
  if ((claim.meta.changes ?? 0) !== 1) {
    const latest = await env.DB.prepare(
      "SELECT * FROM upload_authorisations WHERE id = ?1",
    )
      .bind(authorisation.id)
      .first<UploadAuthorisationRow>();
    if (latest?.state === "stored" || latest?.used_at) {
      return existingUploadResponse(env, latest);
    }
    throw new ApiError(409, "upload_in_progress", "This upload is already in progress or expired.");
  }

  const bucket = purpose === "brand_asset" ? env.BRAND_ASSETS : env.CONSENTED_GUEST_OUTPUTS;
  let stored: R2Object | null;
  try {
    stored = await bucket.put(authorisation.object_key, buffer, {
      httpMetadata: {
        contentType: authorisation.content_type,
        cacheControl: purpose === "brand_asset" ? "private, max-age=300" : "private, no-store",
      },
      customMetadata: {
        purpose,
        eventId: authorisation.event_id,
        authorisationId: authorisation.id,
        sha256: authorisation.sha256_hex,
        state: "pending_d1_finalization",
      },
    });
  } catch (error) {
    await resetFailedClaim(env, authorisation.id, claimId, "r2_put_failed");
    throw error;
  }
  if (!stored) {
    await resetFailedClaim(env, authorisation.id, claimId, "r2_put_failed");
    throw new ApiError(503, "storage_unavailable", "The file could not be stored.");
  }
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (purpose === "brand_asset") {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO brand_assets (
           id, organisation_id, event_id, upload_authorisation_id, kind,
           object_key, original_filename, content_type, size_bytes,
           sha256_hex, r2_etag, finalization_claim_id, created_at, deleted_at
         ) VALUES (?1, ?2, ?3, ?1, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, NULL)`,
      ).bind(
        authorisation.id,
        authorisation.organisation_id,
        authorisation.event_id,
        authorisation.asset_kind,
        authorisation.object_key,
        authorisation.original_filename,
        authorisation.content_type,
        authorisation.size_bytes,
        authorisation.sha256_hex,
        stored.etag,
        claimId,
        now,
      ),
      env.DB.prepare(
        `UPDATE business_events
            SET active_logo_asset_id = ?1, updated_at = ?2
          WHERE id = ?3 AND organisation_id = ?4`,
      ).bind(authorisation.id, now, authorisation.event_id, authorisation.organisation_id),
    );
  } else {
    // These fields were checked immediately before R2 storage and are checked
    // once more by the D1 trigger in the finalization transaction.
    if (!guestConsent || !authorisation.attendee_id) {
      throw new ApiError(409, "consent_record_incomplete", "The photo-use consent record is incomplete.");
    }
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO guest_outputs (
           id, organisation_id, event_id, attendee_id,
           upload_authorisation_id, kind, object_key, content_type,
           size_bytes, sha256_hex, r2_etag, consent_wording_version,
           photo_use_consent_wording, consent_timestamp,
           finalization_claim_id, created_at, deleted_at
         ) VALUES (
           ?1, ?2, ?3, ?4, ?1, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, NULL
         )`,
      ).bind(
        authorisation.id,
        authorisation.organisation_id,
        authorisation.event_id,
        authorisation.attendee_id,
        authorisation.asset_kind,
        authorisation.object_key,
        authorisation.content_type,
        authorisation.size_bytes,
        authorisation.sha256_hex,
        stored.etag,
        guestConsent.consent_wording_version,
        guestConsent.photo_use_consent_wording,
        guestConsent.consent_timestamp,
        claimId,
        now,
      ),
    );
  }
  statements.push(
    env.DB.prepare(
      `UPDATE upload_authorisations
          SET used_at = ?1, state = 'stored', r2_etag = ?2,
              claim_expires_at = NULL, last_error_code = NULL
        WHERE id = ?3 AND state = 'uploading' AND claim_id = ?4
          AND used_at IS NULL`,
    ).bind(now, stored.etag, authorisation.id, claimId),
  );
  try {
    await env.DB.batch(statements);
  } catch (error) {
    try {
      await bucket.delete(authorisation.object_key);
    } catch (cleanupError) {
      console.error("rejected_upload_cleanup_failed", {
        authorisationId: authorisation.id,
        purpose,
        errorType: cleanupError instanceof Error ? cleanupError.name : "unknown",
      });
    }
    await resetFailedClaim(env, authorisation.id, claimId, "d1_finalization_failed");
    if (
      purpose === "guest_output" &&
      error instanceof Error &&
      error.message.includes("guest_output_collection_not_allowed")
    ) {
      throw new ApiError(
        403,
        "guest_output_collection_not_allowed",
        "Photo collection was disabled or consent is no longer active.",
      );
    }
    if (
      purpose === "brand_asset" &&
      error instanceof Error &&
      error.message.includes("brand_asset_scope_not_active")
    ) {
      throw new ApiError(403, "brand_asset_scope_not_active", "The Business event is not active.");
    }
    throw error;
  }
  return json(
    {
      uploaded: true,
      assetId: authorisation.id,
      kind: authorisation.asset_kind,
      purpose,
    },
    201,
  );
}

export async function getPublicLogo(
  request: Request,
  env: Env,
  publicId: string,
): Promise<Response> {
  const event = await requirePublicEvent(request, env, publicId);
  if (!event.active_logo_asset_id) {
    throw new ApiError(404, "logo_not_found", "This event has no active logo.");
  }
  const asset = await env.DB.prepare(
    `SELECT object_key, content_type, r2_etag
       FROM brand_assets
      WHERE id = ?1 AND event_id = ?2 AND deleted_at IS NULL`,
  )
    .bind(event.active_logo_asset_id, event.id)
    .first<{ object_key: string; content_type: string; r2_etag: string }>();
  if (!asset) throw new ApiError(404, "logo_not_found", "This event has no active logo.");
  const object = await env.BRAND_ASSETS.get(asset.object_key);
  if (!object) throw new ApiError(404, "logo_not_found", "This event logo is unavailable.");
  return new Response(object.body, {
    headers: {
      "content-type": asset.content_type,
      etag: object.httpEtag,
      "cache-control": "private, max-age=300",
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function reconcilePendingUploads(env: Env): Promise<void> {
  const now = new Date().toISOString();
  const stale = await env.DB.prepare(
    `SELECT * FROM upload_authorisations
      WHERE used_at IS NULL
        AND (
          state = 'failed' OR
          (state = 'uploading' AND claim_expires_at <= ?1)
        )
      ORDER BY created_at ASC
      LIMIT 100`,
  )
    .bind(now)
    .all<UploadAuthorisationRow>();
  for (const authorisation of stale.results ?? []) {
    const finalized = await findExistingUpload(env, authorisation);
    if (finalized) {
      await env.DB.prepare(
        `UPDATE upload_authorisations
            SET state = 'stored', used_at = COALESCE(used_at, ?1),
                claim_expires_at = NULL, last_error_code = NULL
          WHERE id = ?2`,
      )
        .bind(now, authorisation.id)
        .run();
      continue;
    }
    const bucket = authorisation.purpose === "brand_asset"
      ? env.BRAND_ASSETS
      : env.CONSENTED_GUEST_OUTPUTS;
    await bucket.delete(authorisation.object_key);
    await env.DB.prepare(
      `UPDATE upload_authorisations
          SET state = 'failed', claim_expires_at = NULL,
              last_error_code = 'reconciled_unfinalized_upload'
        WHERE id = ?1 AND used_at IS NULL`,
    )
      .bind(authorisation.id)
      .run();
  }
}

async function createAuthorisation(
  env: Env,
  input: {
    purpose: "brand_asset" | "guest_output";
    organisationId: string;
    eventId: string;
    attendeeId: string | null;
    kind: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    sha256: string;
  },
): Promise<{
  id: string;
  purpose: "brand_asset" | "guest_output";
  token: string;
  expiresAt: string;
} & typeof input> {
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  const objectKey = `${input.purpose === "brand_asset" ? "brand-assets" : "guest-outputs"}/${input.organisationId}/${input.eventId}/${id}`;
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const claims: UploadClaims = {
    purpose: input.purpose,
    authorisationId: id,
    iat: nowSeconds,
    exp: Math.floor(expiresAt.getTime() / 1000),
  };
  const statement = input.purpose === "guest_output"
    ? env.DB.prepare(
      `INSERT INTO upload_authorisations (
         id, purpose, organisation_id, event_id, attendee_id, asset_kind,
         object_key, original_filename, content_type, size_bytes, sha256_hex,
         expires_at, used_at, created_at
       )
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, NULL, ?13
        WHERE (
          SELECT COUNT(*) FROM upload_authorisations ua
           WHERE ua.purpose = 'guest_output' AND ua.attendee_id = ?5
             AND (ua.state = 'stored' OR (
               ua.state IN ('authorised', 'uploading') AND ua.expires_at > ?13
             ))
        ) < ?14
          AND (
            SELECT COALESCE(SUM(ua.size_bytes), 0) FROM upload_authorisations ua
             WHERE ua.purpose = 'guest_output' AND ua.attendee_id = ?5
               AND (ua.state = 'stored' OR (
                 ua.state IN ('authorised', 'uploading') AND ua.expires_at > ?13
               ))
          ) + ?10 <= ?15
          AND (
            SELECT COUNT(*) FROM upload_authorisations ua
             WHERE ua.purpose = 'guest_output' AND ua.event_id = ?4
               AND (ua.state = 'stored' OR (
                 ua.state IN ('authorised', 'uploading') AND ua.expires_at > ?13
               ))
          ) < ?16
          AND (
            SELECT COALESCE(SUM(ua.size_bytes), 0) FROM upload_authorisations ua
             WHERE ua.purpose = 'guest_output' AND ua.event_id = ?4
               AND (ua.state = 'stored' OR (
                 ua.state IN ('authorised', 'uploading') AND ua.expires_at > ?13
               ))
          ) + ?10 <= ?17`,
    ).bind(
      id,
      input.purpose,
      input.organisationId,
      input.eventId,
      input.attendeeId,
      input.kind,
      objectKey,
      input.fileName,
      input.contentType,
      input.sizeBytes,
      input.sha256,
      expiresAt.toISOString(),
      now.toISOString(),
      MAX_GUEST_OUTPUTS_PER_ATTENDEE,
      MAX_GUEST_BYTES_PER_ATTENDEE,
      MAX_GUEST_OUTPUTS_PER_EVENT,
      MAX_GUEST_BYTES_PER_EVENT,
    )
    : env.DB.prepare(
      `INSERT INTO upload_authorisations (
       id, purpose, organisation_id, event_id, attendee_id, asset_kind,
       object_key, original_filename, content_type, size_bytes, sha256_hex,
       expires_at, used_at, created_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, NULL, ?13)`,
    ).bind(
      id,
      input.purpose,
      input.organisationId,
      input.eventId,
      input.attendeeId,
      input.kind,
      objectKey,
      input.fileName,
      input.contentType,
      input.sizeBytes,
      input.sha256,
      expiresAt.toISOString(),
      now.toISOString(),
    );
  const inserted = await statement.run();
  if ((inserted.meta.changes ?? 0) !== 1) {
    throw new ApiError(
      429,
      "guest_output_quota_reached",
      "This guest or event has reached its consented-output storage allowance.",
    );
  }
  return {
    ...input,
    id,
    token: await signClaims(claims, env.TOKEN_SIGNING_SECRET),
    expiresAt: expiresAt.toISOString(),
  };
}

function uploadAuthorisationResponse(
  request: Request,
  authorisation: {
    id: string;
    purpose: "brand_asset" | "guest_output";
    token: string;
    expiresAt: string;
    contentType: string;
    sizeBytes: number;
    sha256: string;
  },
  status: number,
): Response {
  const url = new URL(request.url);
  return json(
    {
      authorisationId: authorisation.id,
      method: "PUT",
      uploadUrl: `${url.origin}/v1/uploads/${authorisation.purpose}/${authorisation.id}`,
      uploadToken: authorisation.token,
      expiresAt: authorisation.expiresAt,
      requiredHeaders: {
        Authorization: `Bearer ${authorisation.token}`,
        "Content-Type": authorisation.contentType,
      },
      expectedSizeBytes: authorisation.sizeBytes,
      sha256: authorisation.sha256,
    },
    status,
  );
}

function parseUploadRequest(
  body: UploadRequestBody,
  allowedTypes: Set<string>,
  maxBytes: number,
): { fileName: string; contentType: string; sizeBytes: number; sha256: string } {
  const fileName = requireString(body.fileName, "fileName", { min: 1, max: 160 });
  const contentType = requireString(body.contentType, "contentType", { min: 3, max: 80 }).toLowerCase();
  if (!allowedTypes.has(contentType)) {
    throw new ApiError(415, "unsupported_file_type", "That file type is not supported.");
  }
  if (!Number.isInteger(body.sizeBytes) || Number(body.sizeBytes) <= 0 || Number(body.sizeBytes) > maxBytes) {
    throw new ApiError(
      400,
      "invalid_file_size",
      `sizeBytes must be between 1 and ${maxBytes}.`,
    );
  }
  const sha256 = requireString(body.sha256, "sha256", { min: 64, max: 64 }).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new ApiError(400, "invalid_checksum", "sha256 must be a hexadecimal SHA-256 digest.");
  }
  return { fileName, contentType, sizeBytes: Number(body.sizeBytes), sha256 };
}

async function currentGuestConsent(
  env: Env,
  authorisation: UploadAuthorisationRow,
): Promise<GuestCollectionRow> {
  const row = await env.DB.prepare(
    `SELECT
       e.collect_consented_photos, e.photo_use_consent_enabled,
       a.photo_use_consent, a.photo_use_consent_revoked_at,
       a.consent_wording_version, a.photo_use_consent_wording,
       a.consent_timestamp
     FROM business_events e
     JOIN attendees a ON a.event_id = e.id
     JOIN business_organisations o ON o.id = e.organisation_id
     WHERE e.id = ?1 AND e.organisation_id = ?2 AND a.id = ?3
       AND e.status = 'live' AND o.status = 'active'`,
  )
    .bind(authorisation.event_id, authorisation.organisation_id, authorisation.attendee_id)
    .first<GuestCollectionRow>();
  if (!row) throw new ApiError(409, "attendee_consent_required", "A consent record is required.");
  return row;
}

function assertGuestCollectionAllowed(row: GuestCollectionRow): void {
  if (
    !mayCollectGuestOutput({
      collectConsentedPhotos: row.collect_consented_photos === 1,
      photoUseConsentEnabled: row.photo_use_consent_enabled === 1,
      photoUseConsent: row.photo_use_consent === null ? null : row.photo_use_consent === 1,
      photoUseConsentRevokedAt: row.photo_use_consent_revoked_at,
    })
  ) {
    throw new ApiError(
      403,
      "guest_output_collection_not_allowed",
      "This event or attendee has not authorised photo collection.",
    );
  }
}

function assertMagicBytes(buffer: ArrayBuffer, contentType: string): void {
  const bytes = new Uint8Array(buffer.slice(0, 16));
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (contentType === "image/png" && !startsWith(bytes, png)) {
    throw new ApiError(400, "invalid_file_signature", "The file is not a valid PNG.");
  }
  if (contentType === "image/jpeg" && !(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) {
    throw new ApiError(400, "invalid_file_signature", "The file is not a valid JPEG.");
  }
  if (
    contentType === "video/mp4" &&
    !(bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70)
  ) {
    throw new ApiError(400, "invalid_file_signature", "The file is not a valid MP4 container.");
  }
}

function startsWith(value: Uint8Array, prefix: number[]): boolean {
  return prefix.every((byte, index) => value[index] === byte);
}

async function existingUploadResponse(
  env: Env,
  authorisation: UploadAuthorisationRow,
): Promise<Response> {
  const existing = await findExistingUpload(env, authorisation);
  if (!existing) throw new ApiError(409, "upload_already_used", "The upload token was already used.");
  return json({
    uploaded: true,
    assetId: existing.id,
    kind: existing.kind,
    purpose: authorisation.purpose,
    idempotentReplay: true,
  });
}

async function findExistingUpload(
  env: Env,
  authorisation: UploadAuthorisationRow,
): Promise<{ id: string; kind: string } | null> {
  const table = authorisation.purpose === "brand_asset" ? "brand_assets" : "guest_outputs";
  return env.DB.prepare(
    `SELECT id, kind FROM ${table} WHERE upload_authorisation_id = ?1`,
  )
    .bind(authorisation.id)
    .first<{ id: string; kind: string }>();
}

async function assertActiveBrandScope(
  env: Env,
  authorisation: UploadAuthorisationRow,
): Promise<void> {
  const active = await env.DB.prepare(
    `SELECT 1 AS active
       FROM business_events e
       JOIN business_organisations o ON o.id = e.organisation_id
      WHERE e.id = ?1 AND e.organisation_id = ?2
        AND e.status != 'archived' AND o.status = 'active'`,
  )
    .bind(authorisation.event_id, authorisation.organisation_id)
    .first<{ active: number }>();
  if (!active) {
    throw new ApiError(403, "brand_asset_scope_not_active", "The Business event is not active.");
  }
}

async function resetFailedClaim(
  env: Env,
  authorisationId: string,
  claimId: string,
  errorCode: string,
): Promise<void> {
  try {
    await env.DB.prepare(
      `UPDATE upload_authorisations
          SET state = 'failed', last_error_code = ?1, claim_expires_at = NULL
        WHERE id = ?2 AND state = 'uploading' AND claim_id = ?3`,
    )
      .bind(errorCode, authorisationId, claimId)
      .run();
  } catch (error) {
    console.error("upload_claim_state_update_failed", {
      authorisationId,
      errorType: error instanceof Error ? error.name : "unknown",
    });
  }
}

function requireSigningSecret(env: Env): void {
  if (isUnsafeSecret(env.TOKEN_SIGNING_SECRET)) {
    throw new ApiError(503, "service_not_configured", "Token signing is not configured.");
  }
}
