import { describe, expect, it } from "vitest";
import { paymentLifecycleAction } from "../src/billing";

describe("payment lifecycle policy", () => {
  it("revokes on a full refund but not a partial charge refund event", () => {
    expect(paymentLifecycleAction("charge.refunded", { refunded: true })).toEqual({
      nextStatus: "refunded",
      revoke: true,
      restoreWonDispute: false,
    });
    expect(paymentLifecycleAction("charge.refunded", { refunded: false })).toBeNull();
  });

  it("suspends a dispute and restores only a won dispute", () => {
    expect(paymentLifecycleAction("charge.dispute.created", {})).toMatchObject({
      nextStatus: "disputed",
      revoke: true,
    });
    expect(paymentLifecycleAction("charge.dispute.closed", { status: "won" })).toMatchObject({
      nextStatus: "paid",
      restoreWonDispute: true,
    });
    expect(paymentLifecycleAction("charge.dispute.closed", { status: "lost" })).toMatchObject({
      nextStatus: "disputed",
      revoke: true,
    });
  });
});
