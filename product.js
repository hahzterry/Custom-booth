/* product.js — commercial product rules for LUMEE BOOTH Photobooth.
   This module deliberately contains no checkout, storage or rendering code.
   It is the small, dependency-free boundary that those systems can ask about.

   It uses a UMD wrapper and conservative JavaScript syntax so it can be loaded
   directly by the booth's older Safari targets as well as by Node tests. */
(function (root, factory) {
  "use strict";

  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MyBishBashProduct = factory();
  }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var own = Object.prototype.hasOwnProperty;

  function has(object, key) {
    return own.call(object, key);
  }

  function deepFreeze(value) {
    var keys;
    var i;

    if (!value || (typeof value !== "object" && typeof value !== "function")) {
      return value;
    }
    if (typeof Object.freeze !== "function") {
      return value;
    }
    if (typeof Object.isFrozen === "function" && Object.isFrozen(value)) {
      return value;
    }

    keys = Object.keys(value);
    for (i = 0; i < keys.length; i += 1) {
      deepFreeze(value[keys[i]]);
    }
    return Object.freeze(value);
  }

  function trimmed(value) {
    return typeof value === "string" ? value.replace(/^\s+|\s+$/g, "") : "";
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  function validationResult(errors, value) {
    return deepFreeze({
      valid: errors.length === 0,
      errors: errors,
      value: errors.length === 0 ? value : null
    });
  }

  function validationError(code, field, message) {
    return {
      code: code,
      field: field,
      message: message
    };
  }

  var ENTITLEMENTS = deepFreeze({
    FREE: "FREE",
    ONE_EVENT: "ONE_EVENT",
    PERSONAL_6_MONTH: "PERSONAL_6_MONTH",
    PERSONAL_12_MONTH: "PERSONAL_12_MONTH",
    FOUNDING_LIFETIME: "FOUNDING_LIFETIME",
    BUSINESS: "BUSINESS"
  });

  var ENTITLEMENT_VALUES = deepFreeze([
    ENTITLEMENTS.FREE,
    ENTITLEMENTS.ONE_EVENT,
    ENTITLEMENTS.PERSONAL_6_MONTH,
    ENTITLEMENTS.PERSONAL_12_MONTH,
    ENTITLEMENTS.FOUNDING_LIFETIME,
    ENTITLEMENTS.BUSINESS
  ]);

  function assertEntitlement(entitlement) {
    if (ENTITLEMENT_VALUES.indexOf(entitlement) === -1) {
      throw new TypeError("Unknown LUMEE BOOTH entitlement: " + String(entitlement));
    }
    return entitlement;
  }

  var PLAN_SALE_STATUS = deepFreeze({
    FREE: "free",
    ACTIVE: "active_catalogue",
    RETIRED: "retired",
    CONTACT: "contact"
  });

  /* Public product and price metadata lives here, separately from the
     capability matrix below. UI copy or a price change must never grant a
     feature. Amounts are integer minor units, ready for a server-created
     Stripe Checkout session; they are not proof of purchase. */
  var PLAN_METADATA = {};
  PLAN_METADATA[ENTITLEMENTS.FREE] = {
    entitlement: ENTITLEMENTS.FREE,
    label: "Free",
    amountMinor: 0,
    currency: "USD",
    durationMonths: null,
    lifetime: false,
    contactSales: false,
    checkoutProductKey: null,
    saleStatus: PLAN_SALE_STATUS.FREE,
    restoreSupported: false
  };
  PLAN_METADATA[ENTITLEMENTS.ONE_EVENT] = {
    entitlement: ENTITLEMENTS.ONE_EVENT,
    label: "One Party",
    amountMinor: 4400,        // $444.00 USD (25% below ~$60 avg)
    currency: "USD",
    durationMonths: null,
    lifetime: false,
    contactSales: false,
    checkoutProductKey: "one_event",
    saleStatus: PLAN_SALE_STATUS.ACTIVE,
    /* Recovery for this new entitlement does not exist in the Worker yet.
       Billing remains closed until PB-16 proves recovery end to end. */
    restoreSupported: false
  };
  PLAN_METADATA[ENTITLEMENTS.PERSONAL_6_MONTH] = {
    entitlement: ENTITLEMENTS.PERSONAL_6_MONTH,
    label: "Legacy 6 Months",
    amountMinor: 12200,       // $122.00 USD (Retired, for history)
    currency: "USD",
    durationMonths: 6,
    lifetime: false,
    contactSales: false,
    checkoutProductKey: null,
    saleStatus: PLAN_SALE_STATUS.RETIRED,
    restoreSupported: true
  };
  PLAN_METADATA[ENTITLEMENTS.PERSONAL_12_MONTH] = {
    entitlement: ENTITLEMENTS.PERSONAL_12_MONTH,
    label: "Annual",
    amountMinor: 22200,       // $222.00 USD (25% below ~$300 avg)
    currency: "USD",
    durationMonths: 12,
    lifetime: false,
    contactSales: false,
    checkoutProductKey: "personal_12_month",
    saleStatus: PLAN_SALE_STATUS.ACTIVE,
    restoreSupported: true
  };
  PLAN_METADATA[ENTITLEMENTS.FOUNDING_LIFETIME] = {
    entitlement: ENTITLEMENTS.FOUNDING_LIFETIME,
    label: "Founding Lifetime",
    amountMinor: 37700,       // $377.00 USD (25% below ~$500 avg, kept retired)
    currency: "USD",
    durationMonths: null,
    lifetime: true,
    contactSales: false,
    checkoutProductKey: null,
    saleStatus: PLAN_SALE_STATUS.RETIRED,
    restoreSupported: true,
    foundingCustomerLimit: 500,
    remainingQuantitySource: "verified_purchase_records"
  };
  PLAN_METADATA[ENTITLEMENTS.BUSINESS] = {
    entitlement: ENTITLEMENTS.BUSINESS,
    label: "For Business",
    amountMinor: 66600,       // $666.00 USD (25% below ~$800 avg)
    currency: "USD",
    durationMonths: null,
    lifetime: false,
    contactSales: true,
    checkoutProductKey: null,
    saleStatus: PLAN_SALE_STATUS.CONTACT,
    restoreSupported: false
  };
  deepFreeze(PLAN_METADATA);

  /* Nothing in browser code can verify a Stripe purchase. A success redirect
     is presentational only; a paid entitlement must be issued from server
     state written after a verified webhook. */
  var CHECKOUT_POLICY = deepFreeze({
    provider: "stripe_checkout",
    checkoutCreationEnabled: false,
    closedReason: "billing_gate_not_passed",
    clientSuccessRedirectGrantsEntitlement: false,
    paidEntitlementAuthority: "verified_webhook",
    foundingCountSource: "verified_purchase_records",
    browserSecretsAllowed: false
  });

  function isCheckoutAvailable(entitlement) {
    var plan = getPlanMetadata(entitlement);
    return CHECKOUT_POLICY.checkoutCreationEnabled === true &&
      plan.saleStatus === PLAN_SALE_STATUS.ACTIVE &&
      !!plan.checkoutProductKey;
  }

  function canRestoreEntitlement(entitlement) {
    return getPlanMetadata(entitlement).restoreSupported === true;
  }

  function capabilities(spec) {
    return deepFreeze({
      canUsePhotobooth: true,
      canCreateStrip: true,
      canCreateMagazine: true,
      canCreateLivingPolaroid: true,
      canSave: true,
      canShare: true,
      canPersonaliseEvent: spec.personalise,
      canRemoveFreeBranding: spec.removeFreeBranding,
      canUploadBusinessLogo: spec.business,
      canWhiteLabel: spec.business,
      canCollectEmail: spec.business,
      canConfigureSharing: spec.business,
      canCollectConsent: spec.business,
      canCollectConsentedPhotos: spec.business
    });
  }

  var CAPABILITY_MATRIX = {};
  CAPABILITY_MATRIX[ENTITLEMENTS.FREE] = capabilities({
    personalise: false,
    removeFreeBranding: false,
    business: false
  });
  CAPABILITY_MATRIX[ENTITLEMENTS.ONE_EVENT] = capabilities({
    personalise: true,
    removeFreeBranding: true,
    business: false
  });
  CAPABILITY_MATRIX[ENTITLEMENTS.PERSONAL_6_MONTH] = capabilities({
    personalise: true,
    removeFreeBranding: true,
    business: false
  });
  CAPABILITY_MATRIX[ENTITLEMENTS.PERSONAL_12_MONTH] = capabilities({
    personalise: true,
    removeFreeBranding: true,
    business: false
  });
  CAPABILITY_MATRIX[ENTITLEMENTS.FOUNDING_LIFETIME] = capabilities({
    personalise: true,
    removeFreeBranding: true,
    business: false
  });
  CAPABILITY_MATRIX[ENTITLEMENTS.BUSINESS] = capabilities({
    personalise: true,
    removeFreeBranding: true,
    business: true
  });
  deepFreeze(CAPABILITY_MATRIX);

  function getCapabilities(entitlement) {
    assertEntitlement(entitlement);
    return CAPABILITY_MATRIX[entitlement];
  }

  function getPlanMetadata(entitlement) {
    assertEntitlement(entitlement);
    return PLAN_METADATA[entitlement];
  }

  /* ONE_EVENT is consumed by one EventConfig lifecycle, never by a photo or
     guest-session counter. This describes the boundary; it is deliberately
     not presented as secure client-side enforcement. Clearing local state
     currently fails open, which is another reason checkout remains closed. */
  var ONE_EVENT_SCOPE = deepFreeze({
    kind: "single_event_lifecycle",
    eventCount: 1,
    bindsTo: "eventId",
    liveWindowStartsOn: "explicit_start_event",
    endsOn: "event_status_ended",
    sessionCap: null,
    photoCap: null,
    enforcementAuthority: "local_device_mvp",
    localStateClearBehaviour: "fails_open"
  });

  function getEventScope(entitlement) {
    assertEntitlement(entitlement);
    return entitlement === ENTITLEMENTS.ONE_EVENT ? ONE_EVENT_SCOPE : null;
  }

  var EXPORT_FORMATS = deepFreeze([
    "strip_png",
    "magazine_png",
    "polaroid_png",
    "polaroid_mp4",
    "polaroid_webm"
  ]);

  /* Branding is an export rule, not a DOM-overlay rule. Renderers can use the
     returned policy for PNG pixels and for every frame passed to either
     moving-output encoder. Business white-labelling is an explicit option, never a new
     entitlement inferred from a label or logo. */
  var OUTPUT_BRANDING_POLICIES = deepFreeze({
    FREE: {
      mode: "mybishbash",
      myBishBashText: "LUMEE BOOTH PHOTOBOOTH",
      myBishBashAttributionRequired: true,
      businessBrandAllowed: false,
      brandingPlacement: "integrated_footer",
      renderIntoExportedAsset: true,
      appliesTo: EXPORT_FORMATS
    },
    PERSONAL: {
      mode: "powered_by",
      myBishBashText: "Powered by LUMEE BOOTH Photobooth #LumeeBooth",
      myBishBashAttributionRequired: true,
      businessBrandAllowed: false,
      brandingPlacement: "integrated_footer",
      renderIntoExportedAsset: true,
      appliesTo: EXPORT_FORMATS
    },
    BUSINESS: {
      mode: "business_branded",
      myBishBashText: "Powered by LUMEE BOOTH Photobooth #LumeeBooth",
      myBishBashAttributionRequired: true,
      businessBrandAllowed: true,
      brandingPlacement: "integrated_footer",
      renderIntoExportedAsset: true,
      appliesTo: EXPORT_FORMATS
    },
    WHITE_LABEL: {
      mode: "white_label",
      myBishBashText: null,
      myBishBashAttributionRequired: false,
      businessBrandAllowed: true,
      brandingPlacement: "business_template",
      renderIntoExportedAsset: true,
      appliesTo: EXPORT_FORMATS
    }
  });

  function isPersonal(entitlement) {
    return entitlement === ENTITLEMENTS.ONE_EVENT ||
      entitlement === ENTITLEMENTS.PERSONAL_6_MONTH ||
      entitlement === ENTITLEMENTS.PERSONAL_12_MONTH ||
      entitlement === ENTITLEMENTS.FOUNDING_LIFETIME;
  }

  function getOutputBrandingPolicy(entitlement, options) {
    var wantsWhiteLabel;

    assertEntitlement(entitlement);
    wantsWhiteLabel = !!(options && options.whiteLabel === true);

    if (entitlement === ENTITLEMENTS.FREE) {
      return OUTPUT_BRANDING_POLICIES.FREE;
    }
    if (isPersonal(entitlement)) {
      return OUTPUT_BRANDING_POLICIES.PERSONAL;
    }
    if (wantsWhiteLabel && getCapabilities(entitlement).canWhiteLabel) {
      return OUTPUT_BRANDING_POLICIES.WHITE_LABEL;
    }
    return OUTPUT_BRANDING_POLICIES.BUSINESS;
  }

  var BUSINESS_EVENT_DEFAULTS = deepFreeze({
    collectEmail: false,
    requireEmail: false,
    allowShare: true,
    allowSave: true,
    collectMarketingConsent: false,
    collectPublicityConsent: false,
    collectConsentedPhotos: false
  });

  var BUSINESS_EVENT_KEYS = deepFreeze(Object.keys(BUSINESS_EVENT_DEFAULTS));

  function validateBusinessEventConfig(input) {
    var source = input || {};
    var config = {};
    var errors = [];
    var sourceKeys;
    var i;
    var key;

    if (typeof source !== "object" || source instanceof Array) {
      return validationResult([
        validationError("invalid_config", "config", "Business event configuration must be an object.")
      ], null);
    }

    sourceKeys = Object.keys(source);
    for (i = 0; i < sourceKeys.length; i += 1) {
      key = sourceKeys[i];
      if (BUSINESS_EVENT_KEYS.indexOf(key) === -1) {
        errors.push(validationError("unknown_option", key, "Unknown business event option."));
      }
    }

    for (i = 0; i < BUSINESS_EVENT_KEYS.length; i += 1) {
      key = BUSINESS_EVENT_KEYS[i];
      if (has(source, key) && typeof source[key] !== "boolean") {
        errors.push(validationError("not_boolean", key, "Business event options must be true or false."));
      }
      config[key] = has(source, key) && typeof source[key] === "boolean" ?
        source[key] : BUSINESS_EVENT_DEFAULTS[key];
    }

    if (config.requireEmail && !config.collectEmail) {
      errors.push(validationError(
        "email_collection_required",
        "requireEmail",
        "Email cannot be required when email collection is disabled."
      ));
    }
    if (config.collectMarketingConsent && !config.collectEmail) {
      errors.push(validationError(
        "email_collection_required",
        "collectMarketingConsent",
        "Marketing consent needs an enabled email collection field."
      ));
    }
    if (config.collectConsentedPhotos && !config.collectPublicityConsent) {
      errors.push(validationError(
        "publicity_consent_required",
        "collectConsentedPhotos",
        "Photo collection needs a separate publicity/photo-use decision."
      ));
    }

    return validationResult(errors, deepFreeze(config));
  }

  function createBusinessEventConfig(overrides) {
    var result = validateBusinessEventConfig(overrides || {});
    var codes;

    if (!result.valid) {
      codes = result.errors.map(function (error) { return error.code + ":" + error.field; });
      throw new TypeError("Invalid business event configuration (" + codes.join(", ") + ")");
    }
    return result.value;
  }

  function looksLikeEmail(value) {
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function validateConsentSubmission(configInput, submissionInput) {
    var configResult = validateBusinessEventConfig(configInput || {});
    var submission = submissionInput || {};
    var errors = [];
    var email = "";
    var marketing = null;
    var publicity = null;

    if (!configResult.valid) {
      return validationResult(configResult.errors.slice(), null);
    }
    if (typeof submission !== "object" || submission instanceof Array) {
      return validationResult([
        validationError("invalid_submission", "submission", "Consent submission must be an object.")
      ], null);
    }

    if (has(submission, "email") && typeof submission.email !== "string") {
      errors.push(validationError("invalid_email", "email", "Email address must be text."));
    } else {
      email = trimmed(submission.email);
    }

    if (!configResult.value.collectEmail && email) {
      errors.push(validationError(
        "email_collection_disabled",
        "email",
        "Do not retain an email address when this event has email collection disabled."
      ));
    }
    if (configResult.value.requireEmail && !email) {
      errors.push(validationError("email_required", "email", "An email address is required for this event."));
    }
    if (email && !looksLikeEmail(email)) {
      errors.push(validationError("invalid_email", "email", "Enter a valid email address."));
    }

    if (configResult.value.collectMarketingConsent) {
      if (typeof submission.marketingConsent !== "boolean") {
        errors.push(validationError(
          "explicit_decision_required",
          "marketingConsent",
          "Marketing consent needs its own explicit yes or no decision."
        ));
      } else {
        marketing = submission.marketingConsent;
      }
    } else if (submission.marketingConsent === true) {
      errors.push(validationError(
        "marketing_consent_disabled",
        "marketingConsent",
        "Marketing consent was not enabled for this event."
      ));
    }

    if (marketing === true && !email) {
      errors.push(validationError(
        "email_required_for_marketing",
        "email",
        "An email address is needed when marketing consent is granted."
      ));
    }

    if (configResult.value.collectPublicityConsent) {
      if (typeof submission.publicityConsent !== "boolean") {
        errors.push(validationError(
          "explicit_decision_required",
          "publicityConsent",
          "Publicity/photo-use consent needs its own explicit yes or no decision."
        ));
      } else {
        publicity = submission.publicityConsent;
      }
    } else if (submission.publicityConsent === true) {
      errors.push(validationError(
        "publicity_consent_disabled",
        "publicityConsent",
        "Publicity/photo-use consent was not enabled for this event."
      ));
    }

    return validationResult(errors, deepFreeze({
      emailAddress: configResult.value.collectEmail && email ? email : null,
      marketingConsent: configResult.value.collectMarketingConsent ? marketing : null,
      publicityConsent: configResult.value.collectPublicityConsent ? publicity : null
    }));
  }

  function validateWordingEntry(kind, entry, errors) {
    var text;
    var meaningfulText;
    var version;

    if (!entry || typeof entry !== "object") {
      errors.push(validationError(
        "wording_required",
        "wording." + kind,
        "The exact displayed wording and its version are required."
      ));
      return null;
    }

    text = typeof entry.text === "string" ? entry.text : "";
    meaningfulText = trimmed(text);
    version = trimmed(entry.version);
    if (!meaningfulText || text.length > 4000) {
      errors.push(validationError(
        "invalid_wording",
        "wording." + kind + ".text",
        "Consent wording must contain between 1 and 4000 characters."
      ));
    }
    if (!version || version.length > 100) {
      errors.push(validationError(
        "invalid_wording_version",
        "wording." + kind + ".version",
        "Consent wording version must contain between 1 and 100 characters."
      ));
    }

    return {
      text: text,
      version: version
    };
  }

  function validateConsentWording(configInput, wordingInput) {
    var configResult = validateBusinessEventConfig(configInput || {});
    var wording = wordingInput || {};
    var errors = [];
    var normalized = {
      email: null,
      marketing: null,
      publicity: null
    };

    if (!configResult.valid) {
      return validationResult(configResult.errors.slice(), null);
    }
    if (typeof wording !== "object" || wording instanceof Array) {
      return validationResult([
        validationError("invalid_wording", "wording", "Consent wording must be an object.")
      ], null);
    }

    if (configResult.value.collectEmail) {
      normalized.email = validateWordingEntry("email", wording.email, errors);
    }
    if (configResult.value.collectMarketingConsent) {
      normalized.marketing = validateWordingEntry("marketing", wording.marketing, errors);
    }
    if (configResult.value.collectPublicityConsent) {
      normalized.publicity = validateWordingEntry("publicity", wording.publicity, errors);
    }

    return validationResult(errors, deepFreeze(normalized));
  }

  function normalizedTimestamp(value) {
    var date;

    if (value === undefined || value === null) {
      date = new Date();
    } else if (Object.prototype.toString.call(value) === "[object Date]") {
      date = new Date(value.getTime());
    } else if (typeof value === "string" || isFiniteNumber(value)) {
      date = new Date(value);
    } else {
      return null;
    }

    if (!isFinite(date.getTime())) {
      return null;
    }
    return date.toISOString();
  }

  function validIdentifier(value) {
    var result = trimmed(value);
    return result && result.length <= 200 ? result : null;
  }

  function isPhotoUploadEligible(entitlement, configInput, consentRecord) {
    var configResult;

    if (entitlement !== ENTITLEMENTS.BUSINESS) {
      return false;
    }
    configResult = validateBusinessEventConfig(configInput || {});
    if (!configResult.valid) {
      return false;
    }
    return configResult.value.collectConsentedPhotos === true &&
      configResult.value.collectPublicityConsent === true &&
      !!consentRecord &&
      consentRecord.publicityConsent === true;
  }

  function buildConsentRecord(options) {
    var input = options || {};
    var eventId;
    var guestSessionId;
    var configResult;
    var submissionResult;
    var wordingResult;
    var timestamp;
    var outputReference = null;
    var record;

    if (input.entitlement !== ENTITLEMENTS.BUSINESS) {
      throw new TypeError("Consent records are a Business capability.");
    }

    eventId = validIdentifier(input.eventId);
    guestSessionId = validIdentifier(input.guestSessionId);
    if (!eventId || !guestSessionId) {
      throw new TypeError("A valid eventId and guestSessionId are required.");
    }

    configResult = validateBusinessEventConfig(input.config || {});
    if (!configResult.valid) {
      throw new TypeError("Cannot record consent for an invalid business event configuration.");
    }
    submissionResult = validateConsentSubmission(configResult.value, input.submission || {});
    if (!submissionResult.valid) {
      throw new TypeError("Cannot record an invalid or incomplete consent submission.");
    }
    wordingResult = validateConsentWording(configResult.value, input.wording || {});
    if (!wordingResult.valid) {
      throw new TypeError("Cannot record consent without the exact wording and version shown.");
    }

    timestamp = normalizedTimestamp(input.timestamp);
    if (!timestamp) {
      throw new TypeError("A valid consent timestamp is required.");
    }

    if (input.outputReference !== undefined && input.outputReference !== null) {
      outputReference = validIdentifier(input.outputReference);
      if (!outputReference) {
        throw new TypeError("outputReference must be a non-empty identifier of at most 200 characters.");
      }
      if (!isPhotoUploadEligible(
        input.entitlement,
        configResult.value,
        submissionResult.value
      )) {
        throw new TypeError("An output reference may only be stored for an explicitly consented Business photo collection.");
      }
    }

    record = {
      schemaVersion: "mybishbash.business-consent.v1",
      eventId: eventId,
      guestSessionId: guestSessionId,
      emailAddress: submissionResult.value.emailAddress,
      marketingConsent: submissionResult.value.marketingConsent,
      publicityConsent: submissionResult.value.publicityConsent,
      consentTimestamp: timestamp,
      wording: wordingResult.value,
      eventConfiguration: {
        collectEmail: configResult.value.collectEmail,
        collectMarketingConsent: configResult.value.collectMarketingConsent,
        collectPublicityConsent: configResult.value.collectPublicityConsent,
        collectConsentedPhotos: configResult.value.collectConsentedPhotos
      },
      outputReference: outputReference
    };

    return deepFreeze(record);
  }

  var BRAND_ASSET_POLICY = deepFreeze({
    maxBytes: 2 * 1024 * 1024,
    allowedMimeTypes: ["image/png", "image/jpeg"],
    allowedExtensions: ["png", "jpg", "jpeg"],
    rawSvgAllowed: false,
    svgBoundary: "trusted_server_sanitise_and_rasterise",
    serverContentVerificationRequired: true
  });

  function byteView(bytes) {
    if (!bytes) {
      return null;
    }
    if (Object.prototype.toString.call(bytes) === "[object ArrayBuffer]") {
      return new Uint8Array(bytes);
    }
    if (typeof bytes.length === "number") {
      return bytes;
    }
    if (typeof bytes.byteLength === "number" && bytes.buffer) {
      return new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
    }
    return null;
  }

  function bytesBeginWith(bytes, signature) {
    var i;
    if (!bytes || bytes.length < signature.length) {
      return false;
    }
    for (i = 0; i < signature.length; i += 1) {
      if (bytes[i] !== signature[i]) {
        return false;
      }
    }
    return true;
  }

  function looksLikeSvgBytes(bytes) {
    var length;
    var text = "";
    var i;

    if (!bytes) {
      return false;
    }
    length = Math.min(bytes.length, 256);
    for (i = 0; i < length; i += 1) {
      text += String.fromCharCode(bytes[i]);
    }
    text = text.replace(/^\s+/, "").toLowerCase();
    return text.indexOf("<svg") === 0 ||
      (text.indexOf("<?xml") === 0 && text.indexOf("<svg") !== -1);
  }

  function assetResult(valid, code, details) {
    var result = {
      valid: valid,
      code: code,
      kind: details.kind || null,
      mimeType: details.mimeType || null,
      maxBytes: BRAND_ASSET_POLICY.maxBytes,
      requiresServerVerification: true,
      requiresTrustedSvgSanitization: details.requiresTrustedSvgSanitization === true
    };
    return deepFreeze(result);
  }

  function validateBrandAsset(asset) {
    var file = asset || {};
    var name = trimmed(file.name);
    var declaredMime = trimmed(file.mimeType || file.type).toLowerCase();
    var alternateMime = trimmed(file.mimeType && file.type ? file.type : "").toLowerCase();
    var extension;
    var bytes = byteView(file.bytes);
    var size = file.size;
    var kind;
    var signatureValid;

    if (!name) {
      return assetResult(false, "name_required", {});
    }
    extension = name.indexOf(".") === -1 ? "" : name.split(".").pop().toLowerCase();

    if (declaredMime === "image/svg+xml" || alternateMime === "image/svg+xml" ||
        extension === "svg" || looksLikeSvgBytes(bytes)) {
      return assetResult(false, "svg_requires_trusted_sanitization", {
        kind: "svg",
        mimeType: "image/svg+xml",
        requiresTrustedSvgSanitization: true
      });
    }

    if (!isFiniteNumber(size) || Math.floor(size) !== size || size <= 0) {
      return assetResult(false, "invalid_size", { mimeType: declaredMime });
    }
    if (size > BRAND_ASSET_POLICY.maxBytes) {
      return assetResult(false, "file_too_large", { mimeType: declaredMime });
    }
    if (declaredMime !== "image/png" && declaredMime !== "image/jpeg") {
      return assetResult(false, "unsupported_mime_type", { mimeType: declaredMime });
    }
    if (alternateMime && alternateMime !== declaredMime) {
      return assetResult(false, "conflicting_mime_types", { mimeType: declaredMime });
    }

    kind = declaredMime === "image/png" ? "png" : "jpeg";
    if ((kind === "png" && extension !== "png") ||
        (kind === "jpeg" && extension !== "jpg" && extension !== "jpeg")) {
      return assetResult(false, "extension_mismatch", { kind: kind, mimeType: declaredMime });
    }
    if (!bytes) {
      return assetResult(false, "file_bytes_required", { kind: kind, mimeType: declaredMime });
    }
    if (bytes.length !== size) {
      return assetResult(false, "size_mismatch", { kind: kind, mimeType: declaredMime });
    }

    if (kind === "png") {
      signatureValid = bytesBeginWith(bytes, [137, 80, 78, 71, 13, 10, 26, 10]);
    } else {
      signatureValid = bytesBeginWith(bytes, [255, 216, 255]) &&
        bytes.length >= 5 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217;
    }
    if (!signatureValid) {
      return assetResult(false, "content_signature_mismatch", { kind: kind, mimeType: declaredMime });
    }

    return assetResult(true, "valid_raster_brand_asset", { kind: kind, mimeType: declaredMime });
  }

  return deepFreeze({
    VERSION: "1.0.0",
    ENTITLEMENTS: ENTITLEMENTS,
    ENTITLEMENT_VALUES: ENTITLEMENT_VALUES,
    PLAN_SALE_STATUS: PLAN_SALE_STATUS,
    PLAN_METADATA: PLAN_METADATA,
    CHECKOUT_POLICY: CHECKOUT_POLICY,
    ONE_EVENT_SCOPE: ONE_EVENT_SCOPE,
    CAPABILITY_MATRIX: CAPABILITY_MATRIX,
    EXPORT_FORMATS: EXPORT_FORMATS,
    OUTPUT_BRANDING_POLICIES: OUTPUT_BRANDING_POLICIES,
    BUSINESS_EVENT_DEFAULTS: BUSINESS_EVENT_DEFAULTS,
    BRAND_ASSET_POLICY: BRAND_ASSET_POLICY,
    assertEntitlement: assertEntitlement,
    getPlanMetadata: getPlanMetadata,
    isCheckoutAvailable: isCheckoutAvailable,
    canRestoreEntitlement: canRestoreEntitlement,
    getEventScope: getEventScope,
    getCapabilities: getCapabilities,
    getOutputBrandingPolicy: getOutputBrandingPolicy,
    validateBusinessEventConfig: validateBusinessEventConfig,
    createBusinessEventConfig: createBusinessEventConfig,
    validateConsentSubmission: validateConsentSubmission,
    validateConsentWording: validateConsentWording,
    buildConsentRecord: buildConsentRecord,
    isPhotoUploadEligible: isPhotoUploadEligible,
    validateBrandAsset: validateBrandAsset
  });
}));