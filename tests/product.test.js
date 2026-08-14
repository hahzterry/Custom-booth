"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");
var Product = require("../product.js");

var E = Product.ENTITLEMENTS;

function errorCodes(result) {
  return result.errors.map(function (error) { return error.code + ":" + error.field; });
}

function fullBusinessConfig(overrides) {
  var source = {
    collectEmail: true,
    requireEmail: false,
    allowShare: true,
    allowSave: true,
    collectMarketingConsent: true,
    collectPublicityConsent: true,
    collectConsentedPhotos: true
  };
  Object.keys(overrides || {}).forEach(function (key) {
    source[key] = overrides[key];
  });
  return Product.createBusinessEventConfig(source);
}

function fullWording() {
  return {
    email: {
      text: "Email address for delivery",
      version: "delivery-2026-08-09"
    },
    marketing: {
      text: "I would like to hear about news and offers from Acme.",
      version: "marketing-3"
    },
    publicity: {
      text: "I give Acme permission to use my photographs for promotional purposes.",
      version: "publicity-7"
    }
  };
}

test("exports the six canonical entitlements and fails closed for unknown values", function () {
  assert.deepEqual(Product.ENTITLEMENT_VALUES, [
    "FREE",
    "ONE_EVENT",
    "PERSONAL_6_MONTH",
    "PERSONAL_12_MONTH",
    "FOUNDING_LIFETIME",
    "BUSINESS"
  ]);
  assert.throws(function () {
    Product.getCapabilities("£100");
  }, /Unknown MyBishBash entitlement/);
});

test("keeps plan pricing central and independent from behaviour", function () {
  assert.equal(Product.getPlanMetadata(E.FREE).amountMinor, 0);
  assert.equal(Product.getPlanMetadata(E.ONE_EVENT).label, "One Party");
  assert.equal(Product.getPlanMetadata(E.ONE_EVENT).amountMinor, 900);
  assert.equal(Product.getPlanMetadata(E.PERSONAL_6_MONTH).amountMinor, 3000);
  assert.equal(Product.getPlanMetadata(E.PERSONAL_6_MONTH).saleStatus, "retired");
  assert.equal(Product.getPlanMetadata(E.PERSONAL_6_MONTH).checkoutProductKey, null);
  assert.equal(Product.getPlanMetadata(E.PERSONAL_12_MONTH).label, "Annual");
  assert.equal(Product.getPlanMetadata(E.PERSONAL_12_MONTH).amountMinor, 4900);
  assert.equal(Product.getPlanMetadata(E.FOUNDING_LIFETIME).amountMinor, 10000);
  assert.equal(Product.getPlanMetadata(E.FOUNDING_LIFETIME).saleStatus, "retired");
  assert.equal(Product.getPlanMetadata(E.FOUNDING_LIFETIME).checkoutProductKey, null);
  assert.equal(Product.getPlanMetadata(E.FOUNDING_LIFETIME).foundingCustomerLimit, 500);
  assert.equal(Product.getPlanMetadata(E.FOUNDING_LIFETIME).remainingQuantity, undefined);
  assert.equal(
    Product.getPlanMetadata(E.FOUNDING_LIFETIME).remainingQuantitySource,
    "verified_purchase_records"
  );
  assert.equal(Product.getPlanMetadata(E.BUSINESS).amountMinor, null);
  assert.equal(Product.getPlanMetadata(E.BUSINESS).contactSales, true);
  assert.equal(Product.PLAN_METADATA[E.ONE_EVENT].canPersonaliseEvent, undefined);
  assert.equal(Object.isFrozen(Product.PLAN_METADATA), true);
});

test("keeps billing closed and never treats a client Checkout redirect as proof of purchase", function () {
  assert.deepEqual(Product.CHECKOUT_POLICY, {
    provider: "stripe_checkout",
    checkoutCreationEnabled: false,
    closedReason: "billing_gate_not_passed",
    clientSuccessRedirectGrantsEntitlement: false,
    paidEntitlementAuthority: "verified_webhook",
    foundingCountSource: "verified_purchase_records",
    browserSecretsAllowed: false
  });
  assert.equal(Product.isCheckoutAvailable(E.ONE_EVENT), false);
  assert.equal(Product.isCheckoutAvailable(E.PERSONAL_12_MONTH), false);
  assert.equal(Product.isCheckoutAvailable(E.FOUNDING_LIFETIME), false);
});

test("preserves legacy entitlement recovery while keeping retired plans off sale", function () {
  assert.equal(Product.canRestoreEntitlement(E.PERSONAL_6_MONTH), true);
  assert.equal(Product.canRestoreEntitlement(E.PERSONAL_12_MONTH), true);
  assert.equal(Product.canRestoreEntitlement(E.FOUNDING_LIFETIME), true);
  assert.equal(Product.canRestoreEntitlement(E.ONE_EVENT), false);
  assert.equal(Product.canRestoreEntitlement(E.FREE), false);
});

test("binds One Party to one event lifecycle rather than photo or session counts", function () {
  assert.deepEqual(Product.getEventScope(E.ONE_EVENT), {
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
  assert.equal(Product.getEventScope(E.PERSONAL_12_MONTH), null);
  assert.equal(Object.isFrozen(Product.ONE_EVENT_SCOPE), true);
});

test("derives the complete capability surface from entitlement", function () {
  var namedCapabilities = [
    "canPersonaliseEvent",
    "canRemoveFreeBranding",
    "canUploadBusinessLogo",
    "canWhiteLabel",
    "canCollectEmail",
    "canConfigureSharing",
    "canCollectConsent",
    "canCollectConsentedPhotos"
  ];
  var free = Product.getCapabilities(E.FREE);
  var personal = Product.getCapabilities(E.ONE_EVENT);
  var business = Product.getCapabilities(E.BUSINESS);

  namedCapabilities.forEach(function (key) {
    assert.equal(typeof free[key], "boolean", key + " must be explicit for Free");
    assert.equal(typeof personal[key], "boolean", key + " must be explicit for Personal");
    assert.equal(typeof business[key], "boolean", key + " must be explicit for Business");
  });
  assert.equal(free.canCreateStrip, true);
  assert.equal(free.canCreateMagazine, true);
  assert.equal(free.canCreateLivingPolaroid, true);
  assert.equal(free.canSave, true);
  assert.equal(free.canShare, true);
  assert.equal(free.canPersonaliseEvent, false);
  assert.equal(personal.canPersonaliseEvent, true);
  assert.equal(personal.canRemoveFreeBranding, true);
  assert.equal(personal.canUploadBusinessLogo, false);
  [E.ONE_EVENT, E.PERSONAL_6_MONTH, E.PERSONAL_12_MONTH, E.FOUNDING_LIFETIME].forEach(function (entitlement) {
    assert.equal(Product.getCapabilities(entitlement).canUploadBusinessLogo, false);
    assert.equal(Product.getCapabilities(entitlement).canCollectEmail, false);
  });
  assert.equal(business.canUploadBusinessLogo, true);
  assert.equal(business.canCollectConsentedPhotos, true);
  assert.equal(Object.isFrozen(business), true);
});

test("applies export branding to every real output format", function () {
  var free = Product.getOutputBrandingPolicy(E.FREE);
  var personal = Product.getOutputBrandingPolicy(E.ONE_EVENT, { whiteLabel: true });
  var business = Product.getOutputBrandingPolicy(E.BUSINESS);
  var whiteLabel = Product.getOutputBrandingPolicy(E.BUSINESS, { whiteLabel: true });

  assert.equal(free.myBishBashText, "LUMEE BOOTH PHOTOBOOTH");
  assert.equal(free.myBishBashAttributionRequired, true);
  assert.equal(personal.mode, "powered_by");
  assert.equal(personal.myBishBashAttributionRequired, true);
  assert.equal(business.businessBrandAllowed, true);
  assert.equal(business.myBishBashAttributionRequired, true);
  assert.equal(whiteLabel.mode, "white_label");
  assert.equal(whiteLabel.myBishBashAttributionRequired, false);
  assert.deepEqual(free.appliesTo, [
    "strip_png",
    "magazine_png",
    "polaroid_png",
    "polaroid_mp4",
    "polaroid_webm"
  ]);
  assert.equal(free.renderIntoExportedAsset, true);
});

test("business events default to local-first collection while Share and Save remain on", function () {
  assert.deepEqual(Product.createBusinessEventConfig(), {
    collectEmail: false,
    requireEmail: false,
    allowShare: true,
    allowSave: true,
    collectMarketingConsent: false,
    collectPublicityConsent: false,
    collectConsentedPhotos: false
  });
});

test("business event controls remain independent and reject unsafe dependency combinations", function () {
  var configured = Product.createBusinessEventConfig({
    collectEmail: true,
    requireEmail: true,
    allowShare: false,
    allowSave: true,
    collectMarketingConsent: false,
    collectPublicityConsent: true,
    collectConsentedPhotos: false
  });
  var invalidEmail = Product.validateBusinessEventConfig({ requireEmail: true });
  var invalidMarketing = Product.validateBusinessEventConfig({ collectMarketingConsent: true });
  var invalidPhotos = Product.validateBusinessEventConfig({ collectConsentedPhotos: true });

  assert.equal(configured.allowShare, false);
  assert.equal(configured.allowSave, true);
  assert.equal(configured.collectMarketingConsent, false);
  assert.equal(configured.collectPublicityConsent, true);
  assert.deepEqual(errorCodes(invalidEmail), ["email_collection_required:requireEmail"]);
  assert.deepEqual(errorCodes(invalidMarketing), [
    "email_collection_required:collectMarketingConsent"
  ]);
  assert.deepEqual(errorCodes(invalidPhotos), [
    "publicity_consent_required:collectConsentedPhotos"
  ]);
  assert.throws(function () {
    Product.createBusinessEventConfig({ uploadEverything: true });
  }, /unknown_option/);
});

test("requires separate explicit marketing and publicity decisions without requiring agreement", function () {
  var config = fullBusinessConfig();
  var missing = Product.validateConsentSubmission(config, {
    email: "guest@example.com",
    participated: true
  });
  var declined = Product.validateConsentSubmission(config, {
    email: "guest@example.com",
    marketingConsent: false,
    publicityConsent: false
  });

  assert.deepEqual(errorCodes(missing), [
    "explicit_decision_required:marketingConsent",
    "explicit_decision_required:publicityConsent"
  ]);
  assert.equal(declined.valid, true);
  assert.equal(declined.value.marketingConsent, false);
  assert.equal(declined.value.publicityConsent, false);
});

test("does not infer marketing permission from an email or retain email when collection is off", function () {
  var separate = Product.validateConsentSubmission(fullBusinessConfig(), {
    email: "guest@example.com",
    publicityConsent: false
  });
  var collectionOff = Product.validateConsentSubmission({}, {
    email: "guest@example.com"
  });
  var consentWithoutAddress = Product.validateConsentSubmission(fullBusinessConfig(), {
    email: "",
    marketingConsent: true,
    publicityConsent: false
  });

  assert.equal(errorCodes(separate).indexOf("explicit_decision_required:marketingConsent") !== -1, true);
  assert.deepEqual(errorCodes(collectionOff), ["email_collection_disabled:email"]);
  assert.equal(
    errorCodes(consentWithoutAddress).indexOf("email_required_for_marketing:email") !== -1,
    true
  );
});

test("builds an immutable evidence record with exact wording versions and timestamp", function () {
  var wording = fullWording();
  wording.publicity.text = "  I give Acme permission to use my photographs.\n";
  var record = Product.buildConsentRecord({
    entitlement: E.BUSINESS,
    eventId: "event_acme_launch",
    guestSessionId: "guest_42",
    config: fullBusinessConfig(),
    submission: {
      email: "  guest@example.com  ",
      marketingConsent: false,
      publicityConsent: true
    },
    wording: wording,
    timestamp: "2026-08-09T12:34:56.000Z",
    outputReference: "r2://event_acme_launch/output_42.mp4"
  });

  assert.equal(record.emailAddress, "guest@example.com");
  assert.equal(record.marketingConsent, false);
  assert.equal(record.publicityConsent, true);
  assert.equal(record.wording.marketing.version, "marketing-3");
  assert.equal(record.wording.publicity.text, "  I give Acme permission to use my photographs.\n");
  assert.equal(record.consentTimestamp, "2026-08-09T12:34:56.000Z");
  assert.equal(record.outputReference, "r2://event_acme_launch/output_42.mp4");
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.wording.publicity), true);
  assert.throws(function () {
    record.wording.publicity.version = "changed-later";
  }, TypeError);
});

test("refuses records without versioned wording and refuses paid consent features outside Business", function () {
  assert.throws(function () {
    Product.buildConsentRecord({
      entitlement: E.BUSINESS,
      eventId: "event_1",
      guestSessionId: "guest_1",
      config: fullBusinessConfig(),
      submission: {
        email: "guest@example.com",
        marketingConsent: false,
        publicityConsent: false
      },
      wording: {
        email: { text: "Delivery", version: "1" },
        marketing: { text: "Offers", version: "1" },
        publicity: { text: "Photo use" }
      }
    });
  }, /exact wording and version/);
  assert.throws(function () {
    Product.buildConsentRecord({
      entitlement: E.PERSONAL_12_MONTH,
      eventId: "event_1",
      guestSessionId: "guest_1"
    });
  }, /Business capability/);
});

test("photo upload eligibility requires Business, event opt-in and attendee publicity permission", function () {
  var enabled = fullBusinessConfig();
  var disabled = fullBusinessConfig({ collectConsentedPhotos: false });
  var granted = { publicityConsent: true };
  var declined = { publicityConsent: false };

  assert.equal(Product.isPhotoUploadEligible(E.BUSINESS, enabled, granted), true);
  assert.equal(Product.isPhotoUploadEligible(E.BUSINESS, enabled, declined), false);
  assert.equal(Product.isPhotoUploadEligible(E.BUSINESS, disabled, granted), false);
  assert.equal(Product.isPhotoUploadEligible(E.PERSONAL_12_MONTH, enabled, granted), false);
  assert.equal(Product.isPhotoUploadEligible(E.FREE, enabled, granted), false);
});

test("does not attach an output reference when publicity permission was declined", function () {
  assert.throws(function () {
    Product.buildConsentRecord({
      entitlement: E.BUSINESS,
      eventId: "event_1",
      guestSessionId: "guest_1",
      config: fullBusinessConfig(),
      submission: {
        email: "guest@example.com",
        marketingConsent: false,
        publicityConsent: false
      },
      wording: fullWording(),
      outputReference: "r2://must-not-be-stored.png"
    });
  }, /only be stored for an explicitly consented Business photo collection/);
});

test("accepts content-checked PNG and JPEG brand assets under the size limit", function () {
  var png = [137, 80, 78, 71, 13, 10, 26, 10];
  var jpeg = [255, 216, 255, 224, 0, 255, 217];
  var pngResult = Product.validateBrandAsset({
    name: "brand.png",
    type: "image/png",
    size: png.length,
    bytes: png
  });
  var jpegResult = Product.validateBrandAsset({
    name: "brand.jpeg",
    type: "image/jpeg",
    size: jpeg.length,
    bytes: jpeg
  });

  assert.equal(pngResult.valid, true);
  assert.equal(pngResult.kind, "png");
  assert.equal(jpegResult.valid, true);
  assert.equal(jpegResult.kind, "jpeg");
  assert.equal(pngResult.requiresServerVerification, true);
  assert.equal(Product.BRAND_ASSET_POLICY.maxBytes, 2 * 1024 * 1024);
});

test("rejects raw SVG at a trusted sanitisation boundary and catches disguised content", function () {
  var svgText = "<svg onload=alert(1)></svg>";
  var svgBytes = Array.prototype.map.call(svgText, function (character) {
    return character.charCodeAt(0);
  });
  var svg = Product.validateBrandAsset({
    name: "brand.svg",
    type: "image/svg+xml",
    size: svgBytes.length,
    bytes: svgBytes
  });
  var disguised = Product.validateBrandAsset({
    name: "brand.png",
    type: "image/png",
    size: svgBytes.length,
    bytes: svgBytes
  });

  assert.equal(svg.valid, false);
  assert.equal(svg.code, "svg_requires_trusted_sanitization");
  assert.equal(svg.requiresTrustedSvgSanitization, true);
  assert.equal(disguised.valid, false);
  assert.equal(disguised.code, "svg_requires_trusted_sanitization");
  assert.equal(Product.BRAND_ASSET_POLICY.rawSvgAllowed, false);
});

test("rejects oversize, missing-byte, extension-mismatched and signature-mismatched assets", function () {
  var oversize = Product.validateBrandAsset({
    name: "brand.png",
    type: "image/png",
    size: Product.BRAND_ASSET_POLICY.maxBytes + 1
  });
  var missingBytes = Product.validateBrandAsset({
    name: "brand.png",
    type: "image/png",
    size: 8
  });
  var wrongExtension = Product.validateBrandAsset({
    name: "brand.jpg",
    type: "image/png",
    size: 8,
    bytes: [137, 80, 78, 71, 13, 10, 26, 10]
  });
  var spoof = Product.validateBrandAsset({
    name: "brand.png",
    type: "image/png",
    size: 8,
    bytes: [0, 0, 0, 0, 0, 0, 0, 0]
  });

  assert.equal(oversize.code, "file_too_large");
  assert.equal(missingBytes.code, "file_bytes_required");
  assert.equal(wrongExtension.code, "extension_mismatch");
  assert.equal(spoof.code, "content_signature_mismatch");
});

test("loads as a browser global without CommonJS or dependencies", function () {
  var source = fs.readFileSync(path.join(__dirname, "..", "product.js"), "utf8");
  var sandbox = {};
  vm.runInNewContext(source, sandbox, { filename: "product.js" });
  assert.equal(sandbox.MyBishBashProduct.ENTITLEMENTS.FREE, "FREE");
  assert.equal(sandbox.MyBishBashProduct.ENTITLEMENTS.ONE_EVENT, "ONE_EVENT");
  assert.equal(
    sandbox.MyBishBashProduct.getCapabilities("BUSINESS").canConfigureSharing,
    true
  );
});
