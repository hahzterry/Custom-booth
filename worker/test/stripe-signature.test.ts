import { describe, expect, it } from "vitest";
import { verifyStripeSignature } from "../src/billing";
import { hmacSha256 } from "../src/crypto";

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("Stripe webhook signatures", () => {
  it("accepts a valid v1 signature over the untouched body", async () => {
    const payload = '{"id":"evt_test","type":"checkout.session.completed"}';
    const timestamp = 1_800_000_000;
    const signature = hex(await hmacSha256("whsec_test_secret", `${timestamp}.${payload}`));
    await expect(
      verifyStripeSignature(
        payload,
        `t=${timestamp},v1=${signature}`,
        "whsec_test_secret",
        timestamp,
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects body changes and stale deliveries", async () => {
    const payload = '{"id":"evt_test"}';
    const timestamp = 1_800_000_000;
    const signature = hex(await hmacSha256("whsec_test_secret", `${timestamp}.${payload}`));
    await expect(
      verifyStripeSignature(
        `${payload} `,
        `t=${timestamp},v1=${signature}`,
        "whsec_test_secret",
        timestamp,
      ),
    ).rejects.toMatchObject({ code: "invalid_stripe_signature" });
    await expect(
      verifyStripeSignature(
        payload,
        `t=${timestamp},v1=${signature}`,
        "whsec_test_secret",
        timestamp + 301,
      ),
    ).rejects.toMatchObject({ code: "invalid_stripe_signature" });
  });
});
