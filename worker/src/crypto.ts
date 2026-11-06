import { ApiError } from "./http";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function randomToken(prefix = "", byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return `${prefix}${base64UrlEncode(bytes)}`;
}

export async function sha256Hex(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

export async function timingSafeEqualText(left: string, right: string): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  return timingSafeEqual(new Uint8Array(leftDigest), new Uint8Array(rightDigest));
}

export async function signClaims(
  claims: object,
  secret: string,
): Promise<string> {
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const signature = base64UrlEncode(await hmacSha256(secret, `v1.${payload}`));
  return `v1.${payload}.${signature}`;
}

export async function verifyClaims<T extends { exp: number }>(
  token: string,
  secret: string,
): Promise<T> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !parts[1] || !parts[2]) {
    throw new ApiError(401, "invalid_token", "The access token is invalid.");
  }
  const expected = await hmacSha256(secret, `v1.${parts[1]}`);
  let supplied: Uint8Array;
  try {
    supplied = base64UrlDecode(parts[2]);
  } catch {
    throw new ApiError(401, "invalid_token", "The access token is invalid.");
  }
  if (!timingSafeEqual(expected, supplied)) {
    throw new ApiError(401, "invalid_token", "The access token is invalid.");
  }
  let claims: T;
  try {
    claims = JSON.parse(decoder.decode(base64UrlDecode(parts[1]))) as T;
  } catch {
    throw new ApiError(401, "invalid_token", "The access token is invalid.");
  }
  if (!Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new ApiError(401, "expired_token", "The access token has expired.");
  }
  return claims;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
