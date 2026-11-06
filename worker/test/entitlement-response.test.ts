import { describe, expect, it } from "vitest";
import { currentEntitlement } from "../src/billing";
import { signClaims } from "../src/crypto";
import type { Env, PersonalAccessClaims } from "../src/types";

describe("restored entitlement sessions", () => {
  it("preserves the verified bearer token and its expiry on refresh", async () => {
    const now = Math.floor(Date.now() / 1000);
    const claims: PersonalAccessClaims = {
      purpose: "personal_access",
      sub: "customer-1",
      iat: now,
      exp: now + 3_600,
    };
    const secret = "a-realistic-test-secret-with-more-than-32-bytes";
    const token = await signClaims(claims, secret);
    const statement = {
      bind: () => ({
        all: async () => ({
          results: [
            {
              plan: "PERSONAL_6_MONTH",
              starts_at: "2026-08-01T00:00:00.000Z",
              expires_at: "2027-02-01T00:00:00.000Z",
            },
          ],
        }),
      }),
    };
    const env = {
      TOKEN_SIGNING_SECRET: secret,
      DB: { prepare: () => statement },
    } as unknown as Env;
    const response = await currentEntitlement(
      new Request("https://api.example.test/v1/entitlements/current", {
        headers: { authorization: `Bearer ${token}` },
      }),
      env,
    );
    const body = await response.json() as Record<string, unknown>;
    expect(body.accessToken).toBe(token);
    expect(body.accessTokenExpiresAt).toBe(new Date(claims.exp * 1000).toISOString());
  });
});
