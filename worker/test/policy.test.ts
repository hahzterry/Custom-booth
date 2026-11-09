
import { describe, expect, it } from "vitest";

import {
  addPlanDuration,
  capabilitiesForPlan,
  csvCell,
  isUnsafeSecret,
  mayCollectGuestOutput,
  PERSONAL_PLANS,
  validateBusinessConfig,
} from "../src/policy";

import type { BusinessEventConfig } from "../src/types";

/*
 * MyBishBash Photobooth
 * Worker Policy Tests
 *
 * Current pricing:
 *
 * FREE                 $0
 * ONE_EVENT            $44
 * PERSONAL_6_MONTH     $122 (legacy)
 * PERSONAL_12_MONTH    $222
 * FOUNDING_LIFETIME    $377 (retired)
 * BUSINESS             $666 (contact sales)
 *
 * Stripe checkout is limited to:
 * - ONE_EVENT
 * - PERSONAL_12_MONTH
 *
 * These tests validate policy rules.
 * They do not independently validate Stripe payments.
 */

const safeConfig: BusinessEventConfig = {
  allowShare: true,
  allowDownload: true,
  deliveryMode: "immediate",

  collectEmail: false,
  requireEmailBeforeCompletion: false,

  marketingConsentEnabled: false,
  photoUseConsentEnabled: false,
  collectConsentedPhotos: false,

  marketingConsentWording: null,
  photoUseConsentWording: null,
};

// --------------------------------------------------
// ENTITLEMENT CAPABILITIES
// --------------------------------------------------

describe("entitlement capabilities", () => {
  it("keeps Free and Personal away from Business collection", () => {
    expect(
      capabilitiesForPlan("FREE"),
    ).toMatchObject({
      canPersonaliseEvent: false,
      canCollectEmail: false,
      canCollectConsentedPhotos: false,
    });

    expect(
      capabilitiesForPlan("ONE_EVENT"),
    ).toMatchObject({
      canPersonaliseEvent: true,
      canUploadBusinessLogo: false,
      canCollectEmail: false,
      canCollectConsentedPhotos: false,
    });

    expect(
      capabilitiesForPlan("PERSONAL_6_MONTH"),
    ).toMatchObject({
      canPersonaliseEvent: true,
      canUploadBusinessLogo: false,
      canCollectEmail: false,
      canCollectConsentedPhotos: false,
    });

    expect(
      capabilitiesForPlan("PERSONAL_12_MONTH"),
    ).toMatchObject({
      canPersonaliseEvent: true,
      canUploadBusinessLogo: false,
      canCollectEmail: false,
      canCollectConsentedPhotos: false,
    });

    expect(
      capabilitiesForPlan("FOUNDING_LIFETIME"),
    ).toMatchObject({
      canPersonaliseEvent: true,
      canUploadBusinessLogo: false,
      canCollectEmail: false,
      canCollectConsentedPhotos: false,
    });
  });

  it("grants Business controls only to Business", () => {
    expect(
      capabilitiesForPlan("BUSINESS"),
    ).toMatchObject({
      canUploadBusinessLogo: true,
      canConfigureSharing: true,
      canCollectConsent: true,
      canCollectConsentedPhotos: true,
    });
  });

  it("does not give Business collection access to One Party", () => {
    const capabilities =
      capabilitiesForPlan("ONE_EVENT");

    expect(
      capabilities.canUploadBusinessLogo,
    ).toBe(false);

    expect(
      capabilities.canCollectEmail,
    ).toBe(false);

    expect(
      capabilities.canCollectConsentedPhotos,
    ).toBe(false);
  });

  // --------------------------------------------------
  // PRICING CATALOGUE
  // --------------------------------------------------

  it("pins the advertised Personal prices", () => {
    // One Party: $44
    expect(
      PERSONAL_PLANS.ONE_EVENT.amountMinor,
    ).toBe(4_400);

    // Legacy 6 Months: $122
    expect(
      PERSONAL_PLANS.PERSONAL_6_MONTH.amountMinor,
    ).toBe(12_200);

    // Annual: $222
    expect(
      PERSONAL_PLANS.PERSONAL_12_MONTH.amountMinor,
    ).toBe(22_200);

    // Retired Founding Lifetime: $377
    expect(
      PERSONAL_PLANS.FOUNDING_LIFETIME.amountMinor,
    ).toBe(37_700);
  });

  it("uses USD for all Personal plans", () => {
    expect(
      PERSONAL_PLANS.ONE_EVENT.currency,
    ).toBe("usd");

    expect(
      PERSONAL_PLANS.PERSONAL_6_MONTH.currency,
    ).toBe("usd");

    expect(
      PERSONAL_PLANS.PERSONAL_12_MONTH.currency,
    ).toBe("usd");

    expect(
      PERSONAL_PLANS.FOUNDING_LIFETIME.currency,
    ).toBe("usd");
  });

  // --------------------------------------------------
  // ENTITLEMENT DURATION
  // --------------------------------------------------

  it("uses calendar-month access periods without rolling past month end", () => {
    expect(
      addPlanDuration(
        new Date("2026-08-31T12:00:00Z"),
        "PERSONAL_6_MONTH",
      )?.toISOString(),
    ).toBe("2027-02-28T12:00:00.000Z");

    expect(
      addPlanDuration(
        new Date("2024-02-29T12:00:00Z"),
        "PERSONAL_12_MONTH",
      )?.toISOString(),
    ).toBe("2025-02-28T12:00:00.000Z");
  });

  it("does not assign a calendar-month expiration to One Party", () => {
    expect(
      addPlanDuration(
        new Date("2026-11-09T12:00:00Z"),
        "ONE_EVENT",
      ),
    ).toBeNull();
  });

  it("preserves lifetime entitlement duration rules", () => {
    expect(
      addPlanDuration(
        new Date("2026-11-09T12:00:00Z"),
        "FOUNDING_LIFETIME",
      ),
    ).toBeNull();
  });
});

// --------------------------------------------------
// BUSINESS PRIVACY POLICY
// --------------------------------------------------

describe("Business privacy policy", () => {
  it("requires each dependent event feature to be explicitly enabled", () => {
    expect(
      validateBusinessConfig({
        ...safeConfig,
        collectConsentedPhotos: true,
      }),
    ).toContain(
      "Photo collection requires photo-use consent to be enabled.",
    );

    expect(
      validateBusinessConfig({
        ...safeConfig,
        requireEmailBeforeCompletion: true,
      }),
    ).toContain(
      "Email cannot be required when email collection is disabled.",
    );
  });

  it("requires current, unrevoked affirmative photo-use consent", () => {
    expect(
      mayCollectGuestOutput({
        collectConsentedPhotos: true,
        photoUseConsentEnabled: true,
        photoUseConsent: true,
        photoUseConsentRevokedAt: null,
      }),
    ).toBe(true);

    expect(
      mayCollectGuestOutput({
        collectConsentedPhotos: true,
        photoUseConsentEnabled: true,
        photoUseConsent: false,
        photoUseConsentRevokedAt: null,
      }),
    ).toBe(false);

    expect(
      mayCollectGuestOutput({
        collectConsentedPhotos: true,
        photoUseConsentEnabled: true,
        photoUseConsent: true,
        photoUseConsentRevokedAt:
          "2026-08-09T12:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("does not collect photos when collection is disabled", () => {
    expect(
      mayCollectGuestOutput({
        collectConsentedPhotos: false,
        photoUseConsentEnabled: true,
        photoUseConsent: true,
        photoUseConsentRevokedAt: null,
      }),
    ).toBe(false);
  });

  it("does not collect photos when photo-use consent is disabled", () => {
    expect(
      mayCollectGuestOutput({
        collectConsentedPhotos: true,
        photoUseConsentEnabled: false,
        photoUseConsent: true,
        photoUseConsentRevokedAt: null,
      }),
    ).toBe(false);
  });

  it("neutralises spreadsheet formula injection in organiser exports", () => {
    expect(
      csvCell(
        '=HYPERLINK("https://bad.example")',
      ),
    ).toBe(
      '"\'=HYPERLINK(""https://bad.example"")"',
    );
  });
});

// --------------------------------------------------
// DEPLOYMENT SECRET VALIDATION
// --------------------------------------------------

describe("deployment secrets", () => {
  it("rejects the documented placeholders even when they are long", () => {
    expect(
      isUnsafeSecret(
        "replace-with-at-least-32-random-bytes",
      ),
    ).toBe(true);

    expect(
      isUnsafeSecret(
        "a-genuinely-random-looking-secret-123456789",
      ),
    ).toBe(false);
  });
});
