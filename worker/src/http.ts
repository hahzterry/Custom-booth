import type { Env } from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

export async function readJson<T>(request: Request, maxBytes = 32_768): Promise<T> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    throw new ApiError(415, "unsupported_media_type", "Expected application/json.");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError(413, "payload_too_large", "The request body is too large.");
  }
  const text = await readTextBounded(request, maxBytes);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(400, "invalid_json", "The request body is not valid JSON.");
  }
}

export async function readTextBounded(request: Request, maxBytes: number): Promise<string> {
  const declaredText = request.headers.get("content-length");
  if (declaredText !== null) {
    const declared = Number(declaredText);
    if (!Number.isInteger(declared) || declared < 0) {
      throw new ApiError(400, "invalid_content_length", "Content-Length is invalid.");
    }
    if (declared > maxBytes) {
      throw new ApiError(413, "payload_too_large", "The request body is too large.");
    }
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("payload_too_large");
      throw new ApiError(413, "payload_too_large", "The request body is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export function requireString(
  value: unknown,
  field: string,
  options: { min?: number; max?: number } = {},
): string {
  const min = options.min ?? 1;
  const max = options.max ?? 200;
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_request", `${field} must be text.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new ApiError(
      400,
      "invalid_request",
      `${field} must contain between ${min} and ${max} characters.`,
    );
  }
  return trimmed;
}

export function optionalString(
  value: unknown,
  field: string,
  max = 500,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  return requireString(value, field, { min: 1, max });
}

export function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new ApiError(400, "invalid_request", `${field} must be true or false.`);
  }
  return value;
}

export function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) {
    throw new ApiError(401, "missing_authorisation", "A bearer token is required.");
  }
  return match[1];
}

export function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  const allowed = new Set(
    (env.ALLOWED_ORIGINS ?? "").split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  if (origin && allowed.has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
  headers.set("access-control-allow-methods", "GET, POST, PATCH, PUT, OPTIONS");
  headers.set(
    "access-control-allow-headers",
    "Authorization, Content-Type, Idempotency-Key, X-MyBishBash-Event-Token",
  );
  headers.set("access-control-max-age", "86400");
  return headers;
}

export function withCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  corsHeaders(request, env).forEach((value, key) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof ApiError) {
    return json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
        requestId,
      },
      error.status,
    );
  }
  return json(
    {
      error: {
        code: "internal_error",
        message: "The request could not be completed.",
      },
      requestId,
    },
    500,
  );
}

export function normaliseEmail(value: unknown): { email: string; normalized: string } {
  const email = requireString(value, "email", { min: 3, max: 254 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "invalid_email", "Enter a valid email address.");
  }
  return { email, normalized: email.toLocaleLowerCase("en-GB") };
}
