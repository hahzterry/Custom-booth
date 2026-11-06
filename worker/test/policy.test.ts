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

describe("entitlement capabilities", () => {
  it("keeps Free and Personal away from Business collection", () => {
    expect(capabilitiesForPlan("FREE")).toMatchObject({
      canPersonaliseEvent: false,
      canCollectEmail: false,
      canCollectConsentedPhotos: false,
    });
    expect(capabilitiesForPlan("PERSONAL_6_MONTH")).toMatchObject({
      canPersonaliseEvent: true,
      canUploadBusinessLogo: false,
      canCollectEmail: false,
      canCollectConsentedPhotos: false,
    });
  });

  it("grants Business controls only to Business", () => {
    expect(capabilitiesForPlan("BUSINESS")).toMatchObject({
      canUploadBusinessLogo: true,
      canConfigureSharing: true,
      canCollectConsent: true,
      canCollectConsentedPhotos: true,
    });
  });

  it("pins the advertised Personal prices", () => {
    expect(PERSONAL_PLANS.PERSONAL_6_MONTH.amountMinor).toBe(3_000);
    expect(PERSONAL_PLANS.PERSONAL_12_MONTH.amountMinor).toBe(5_000);
    expect(PERSONAL_PLANS.FOUNDING_LIFETIME.amountMinor).toBe(10_000);
  });

  it("uses calendar-month access periods without rolling past month end", () => {
    expect(addPlanDuration(new Date("2026-08-31T12:00:00Z"), "PERSONAL_6_MONTH")?.toISOString())
      .toBe("2027-02-28T12:00:00.000Z");
    expect(addPlanDuration(new Date("2024-02-29T12:00:00Z"), "PERSONAL_12_MONTH")?.toISOString())
      .toBe("2025-02-28T12:00:00.000Z");
  });
});

describe("Business privacy policy", () => {
  it("requires each dependent event feature to be explicitly enabled", () => {
    expect(
      validateBusinessConfig({
        ...safeConfig,
        collectConsentedPhotos: true,
      }),
    ).toContain("Photo collection requires photo-use consent to be enabled.");

    expect(
      validateBusinessConfig({
        ...safeConfig,
        requireEmailBeforeCompletion: true,
      }),
    ).toContain("Email cannot be required when email collection is disabled.");
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
        photoUseConsentRevokedAt: "2026-08-09T12:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("neutralises spreadsheet formula injection in organiser exports", () => {
    expect(csvCell("=HYPERLINK(\"https://bad.example\")")).toBe(
      '"\'=HYPERLINK(""https://bad.example"")"',
    );
  });
});

describe("deployment secrets", () => {
  it("rejects the documented placeholders even when they are long", () => {
    expect(isUnsafeSecret("replace-with-at-least-32-random-bytes")).toBe(true);
    expect(isUnsafeSecret("a-genuinely-random-looking-secret-123456789")).toBe(false);
  });
});
