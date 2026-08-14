export type PersonalPlan =
  | "PERSONAL_6_MONTH"
  | "PERSONAL_12_MONTH"
  | "FOUNDING_LIFETIME"
  | "ONE_EVENT"; // ✅ Added this!

export type EntitlementPlan = "FREE" | PersonalPlan | "BUSINESS";

export interface Capabilities {
  canPersonaliseEvent: boolean;
  canRemoveFreeBranding: boolean;
  canUploadBusinessLogo: boolean;
  canWhiteLabel: boolean;
  canCollectEmail: boolean;
  canConfigureSharing: boolean;
  canCollectConsent: boolean;
  canCollectConsentedPhotos: boolean;
}

export interface RestoreEmailMessage {
  type: "mybishbash.photobooth.entitlement_restore";
  to: string;
  token: string;
  verifyUrl: string;
  expiresAt: string;
}

export interface Env {
  DB: D1Database;
  BRAND_ASSETS: R2Bucket;
  CONSENTED_GUEST_OUTPUTS: R2Bucket;
  ENTITLEMENT_EMAIL_QUEUE: Queue<RestoreEmailMessage>;
  CHECKOUT_RATE_LIMITER: RateLimit;
  PUBLIC_API_RATE_LIMITER: RateLimit;

  ENVIRONMENT: string;
  PUBLIC_APP_ORIGIN: string;
  ALLOWED_ORIGINS: string;
  STRIPE_EXPECTED_LIVEMODE: string;
  
  // ✅ CORRECTED: Removed "PERSONAL_" prefix to match billing.ts and your actual Wrangler vars
  STRIPE_PRICE_ONE_EVENT: string;        
  STRIPE_PRICE_PERSONAL_6_MONTH: string;
  STRIPE_PRICE_PERSONAL_12_MONTH: string;
  STRIPE_PRICE_FOUNDING_LIFETIME: string;
  STRIPE_PRICE_BUSINESS: string;

  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  TOKEN_SIGNING_SECRET: string;
  PLATFORM_ADMIN_BEARER_TOKEN: string;
}

export interface BusinessEventConfig {
  allowShare: boolean;
  allowDownload: boolean;
  deliveryMode: "immediate" | "email_gate" | "configured";
  collectEmail: boolean;
  requireEmailBeforeCompletion: boolean;
  marketingConsentEnabled: boolean;
  photoUseConsentEnabled: boolean;
  collectConsentedPhotos: boolean;
  marketingConsentWording: string | null;
  photoUseConsentWording: string | null;
}

export interface BusinessEventRow {
  id: string;
  organisation_id: string;
  public_id: string;
  public_access_token_hash: string;
  name: string;
  event_date: string | null;
  brand_name: string;
  primary_colour: string;
  secondary_colour: string;
  welcome_heading: string;
  welcome_cta: string;
  welcome_hint: string;
  status: "draft" | "live" | "archived";
  allow_share: number;
  allow_download: number;
  delivery_mode: "immediate" | "email_gate" | "configured";
  collect_email: number;
  require_email_before_completion: number;
  marketing_consent_enabled: number;
  photo_use_consent_enabled: number;
  collect_consented_photos: number;
  marketing_consent_wording: string | null;
  photo_use_consent_wording: string | null;
  consent_wording_version: number;
  white_label: number;
  active_logo_asset_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessPrincipal {
  organisationId: string;
  keyId: string;
}

export interface PersonalAccessClaims {
  purpose: "personal_access";
  sub: string;
  iat: number;
  exp: number;
}

export interface GuestSessionClaims {
  purpose: "guest_session";
  eventId: string;
  sessionId: string;
  iat: number;
  exp: number;
}

export interface UploadClaims {
  purpose: "brand_asset" | "guest_output";
  authorisationId: string;
  iat: number;
  exp: number;
}

export type SignedClaims =
  | PersonalAccessClaims
  | GuestSessionClaims
  | UploadClaims;