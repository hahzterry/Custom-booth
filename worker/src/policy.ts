import type {
  BusinessEventConfig,
  Capabilities,
  EntitlementPlan,
  PersonalPlan,
} from "./types";

export const FOUNDING_LIFETIME_LIMIT = 500;

// 💰 Updated to USD amounts, and added ONE_EVENT & BUSINESS.
export const PERSONAL_PLANS: Record<
  PersonalPlan,
  { amountMinor: number; currency: "usd"; durationMonths: number | null }
> = {
  ONE_EVENT: { amountMinor: 4_400, currency: "usd", durationMonths: null },      // $44.00
  PERSONAL_6_MONTH: { amountMinor: 12_200, currency: "usd", durationMonths: 6 }, // $122.00
  PERSONAL_12_MONTH: { amountMinor: 22_200, currency: "usd", durationMonths: 12 }, // $222.00
  FOUNDING_LIFETIME: { amountMinor: 37_700, currency: "usd", durationMonths: null }, // $377.00
  BUSINESS: { amountMinor: 66_600, currency: "usd", durationMonths: null },      // $666.00
};

const FREE_CAPABILITIES: Capabilities = {
  canPersonaliseEvent: false,
  canRemoveFreeBranding: false,
  canUploadBusinessLogo: false,
  canWhiteLabel: false,
  canCollectEmail: false,
  canConfigureSharing: false,
  canCollectConsent: false,
  canCollectConsentedPhotos: false,
};

// All Personal plans (including ONE_EVENT and BUSINESS) get the same Personal capabilities.
const PERSONAL_CAPABILITIES: Capabilities = {
  ...FREE_CAPABILITIES,
  canPersonaliseEvent: true,
  canRemoveFreeBranding: true,
};

const BUSINESS_CAPABILITIES: Capabilities = {
  canPersonaliseEvent: true,
  canRemoveFreeBranding: true,
  canUploadBusinessLogo: true,
  canWhiteLabel: true,
  canCollectEmail: true,
  canConfigureSharing: true,
  canCollectConsent: true,
  canCollectConsentedPhotos: true,
};

export function capabilitiesForPlan(plan: EntitlementPlan): Capabilities {
  if (plan === "FREE") return { ...FREE_CAPABILITIES };
  if (plan === "BUSINESS") return { ...BUSINESS_CAPABILITIES };
  return { ...PERSONAL_CAPABILITIES };
}

export function isPersonalPlan(value: unknown): value is PersonalPlan {
  return typeof value === "string" && value in PERSONAL_PLANS;
}

export function addPlanDuration(start: Date, plan: PersonalPlan): Date | null {
  const duration = PERSONAL_PLANS[plan].durationMonths;
  if (duration === null) return null;
  const result = new Date(start.getTime());
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + duration);
  const daysInTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, daysInTargetMonth));
  return result;
}

export function validateBusinessConfig(config: BusinessEventConfig): string[] {
  const errors: string[] = [];
  if (config.requireEmailBeforeCompletion && !config.collectEmail) {
    errors.push("Email cannot be required when email collection is disabled.");
  }
  if (config.marketingConsentEnabled && !config.collectEmail) {
    errors.push("Marketing consent requires email collection to be enabled.");
  }
  if (config.collectConsentedPhotos && !config.photoUseConsentEnabled) {
    errors.push("Photo collection requires photo-use consent to be enabled.");
  }
  if (
    config.deliveryMode === "email_gate" &&
    (!config.collectEmail || !config.requireEmailBeforeCompletion)
  ) {
    errors.push("Email-gated delivery requires email collection and a required email.");
  }
  if (
    config.marketingConsentEnabled &&
    !nonEmpty(config.marketingConsentWording)
  ) {
    errors.push("Marketing consent wording is required when the option is enabled.");
  }
  if (
    config.photoUseConsentEnabled &&
    !nonEmpty(config.photoUseConsentWording)
  ) {
    errors.push("Photo-use consent wording is required when the option is enabled.");
  }
  return errors;
}

export function mayCollectGuestOutput(input: {
  collectConsentedPhotos: boolean;
  photoUseConsentEnabled: boolean;
  photoUseConsent: boolean | null;
  photoUseConsentRevokedAt: string | null;
}): boolean {
  return (
    input.collectConsentedPhotos &&
    input.photoUseConsentEnabled &&
    input.photoUseConsent === true &&
    input.photoUseConsentRevokedAt === null
  );
}

export const BRAND_CONTENT_TYPES = new Set(["image/png", "image/jpeg"]);
export const GUEST_OUTPUT_CONTENT_TYPES = new Set(["image/png", "video/mp4"]);
export const MAX_BRAND_ASSET_BYTES = 2 * 1024 * 1024;
export const MAX_GUEST_OUTPUT_BYTES = 20 * 1024 * 1024;
export const MAX_GUEST_OUTPUTS_PER_ATTENDEE = 12;
export const MAX_GUEST_BYTES_PER_ATTENDEE = 120 * 1024 * 1024;
export const MAX_GUEST_OUTPUTS_PER_EVENT = 5_000;
export const MAX_GUEST_BYTES_PER_EVENT = 5 * 1024 * 1024 * 1024;

export function nonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isUnsafeSecret(value: string | null | undefined): boolean {
  if (!value || value.length < 32) return true;
  const normalized = value.toLowerCase();
  return (
    normalized.includes("replace") ||
    normalized.includes("change-me") ||
    normalized.includes("changeme") ||
    normalized.includes("your-secret") ||
    normalized.includes("example-secret")
  );
}

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Prevent spreadsheet formula execution when an organiser opens the export.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}