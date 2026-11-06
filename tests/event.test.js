"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");
var Event = require("../event.js");

var FIXED_ID = "event_sophies_hen";
var START_MS = Date.parse("2027-05-16T18:00:00.000Z");
var EXPECTED_THEMES = {
  pop: {
    name: "Pop", tagline: "Colourful · playful · bold",
    primary: "#b52167", secondary: "#eee6ff", highlight: "#fff0aa",
    background: "#ffdce8", foreground: "#111111",
    button: "#b52167", buttonInk: "#ffffff", border: "#111111",
    decoration: "playful-shapes", typography: "bold-sans",
    stripFrame: "white", stripFilter: "original", magazineTemplate: "keepsake"
  },
  "after-dark": {
    name: "After Dark", tagline: "Dark · cool · confident",
    primary: "#d86c8f", secondary: "#242126", highlight: "#eee6ff",
    background: "#0b0b0b", foreground: "#ffffff",
    button: "#ffffff", buttonInk: "#111111", border: "#ffffff",
    decoration: "restrained-orbit", typography: "confident-sans",
    stripFrame: "black", stripFilter: "original", magazineTemplate: "noir"
  },
  editorial: {
    name: "Editorial", tagline: "Clean · sophisticated · minimal",
    primary: "#756057", secondary: "#e7ded3", highlight: "#c8b5a6",
    background: "#f8f5ef", foreground: "#111111",
    button: "#111111", buttonInk: "#ffffff", border: "#111111",
    decoration: "fine-rule", typography: "editorial-serif",
    stripFrame: "editorial", stripFilter: "original", magazineTemplate: "editorial"
  },
  sunshine: {
    name: "Sunshine", tagline: "Bright · warm · optimistic",
    primary: "#245f9f", secondary: "#dcecff", highlight: "#ff8b72",
    background: "#fff0aa", foreground: "#111111",
    button: "#245f9f", buttonInk: "#ffffff", border: "#111111",
    decoration: "sunburst", typography: "bright-sans",
    stripFrame: "white", stripFilter: "warm", magazineTemplate: "press"
  }
};

function fixedOptions(extra) {
  var options = { idFactory: function () { return FIXED_ID; } };
  Object.keys(extra || {}).forEach(function (key) {
    options[key] = extra[key];
  });
  return options;
}

function rawSetupFragment(payload) {
  return "#setup=r." + Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function rawSetupPayload(fragment) {
  var encoded = String(fragment).replace(/^#setup=r\./, "")
    .replace(/-/g, "+").replace(/_/g, "/");
  while (encoded.length % 4) encoded += "=";
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
}

test("exports the accepted event vocabulary through CommonJS and a browser global", function () {
  var source = fs.readFileSync(path.resolve(__dirname, "../event.js"), "utf8");
  var context = {
    self: {},
    Uint8Array: Uint8Array,
    Date: Date,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    RegExp: RegExp,
    Math: Math,
    JSON: JSON,
    Promise: Promise,
    isFinite: isFinite,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  };
  vm.runInNewContext(source, context);

  assert.equal(Event.EVENT_CONFIG_SCHEMA_VERSION, 3);
  assert.equal(Event.SETUP_PASS_VERSION, 3);
  assert.equal(Event.LIVE_DURATION_MS, 48 * 60 * 60 * 1000);
  assert.deepEqual(Event.EVENT_TYPES, [
    "birthday",
    "wedding",
    "baby_shower",
    "anniversary",
    "graduation",
    "party",
    "other"
  ]);
  assert.equal(context.self.MyBishBashEvent.VERSION, "3.0.0");
  assert.equal(Object.isFrozen(Event.EVENT_FIELD_DEFAULTS), true);
  assert.deepEqual(Event.THEME_IDS, ["pop", "after-dark", "editorial", "sunshine"]);
  assert.equal(Object.isFrozen(Event.THEMES), true);
  assert.equal(Object.isFrozen(Event.THEMES.pop), true);
  assert.equal(Event.PALETTES, Event.THEMES, "the transitional palette API aliases themes");
  assert.equal(Event.PALETTE_IDS, Event.THEME_IDS);
  assert.equal(Event.resolvePalette, Event.resolveTheme);
});

test("migrates old flat settings additively without losing renderer fields", function () {
  var oldDefaults = {
    eventTitle: "Your Celebration",
    date: "2026",
    accent: "#ff5b52",
    stripSignature: "",
    mirror: true
  };
  var oldSettings = {
    schemaVersion: 1,
    eventTitle: "  Sophie's Hen  ",
    date: "16.05.27",
    look: "sky",
    accent: "#9f78ff",
    stripSignature: "SOPHIE'S HEN",
    mirror: false
  };
  var migrated = Event.migrateEventConfig(oldSettings, fixedOptions({ defaults: oldDefaults }));

  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.eventId, FIXED_ID);
  assert.equal(migrated.eventType, "birthday", "legacy output keeps the existing Birthday voice");
  assert.equal(migrated.eventTitle, "Sophie's Hen");
  assert.equal(migrated.date, "16.05.27");
  assert.equal(migrated.datePrecision, "exact");
  assert.equal(migrated.themeId, "sunshine");
  assert.equal(migrated.themePrimary, "#245f9f");
  assert.equal(migrated.themeSecondary, "#dcecff");
  assert.equal(migrated.themeHighlight, "#ff8b72");
  assert.equal(migrated.themeBackground, "#fff0aa");
  assert.equal(migrated.themeMagazineTemplate, "press");
  assert.equal(migrated.paletteId, undefined);
  assert.equal(migrated.palettePrimary, undefined);
  assert.equal(migrated.look, undefined);
  assert.equal(migrated.accent, undefined);
  assert.equal(migrated.stripSignature, "SOPHIE'S HEN");
  assert.equal(migrated.mirror, false);
  assert.equal(migrated.eventStatus, "DRAFT");
  assert.equal(migrated.activatedAt, "");

  assert.equal(
    Event.createEventConfig(migrated).eventId,
    FIXED_ID,
    "persisted event identity remains stable across future loads"
  );
  assert.equal(oldSettings.schemaVersion, 1, "migration must not mutate old saved data");
  assert.equal(oldSettings.look, "sky");
  assert.equal(oldSettings.accent, "#9f78ff");
});

test("defines four canonical, frozen themes with complete treatments and safe contrast", function () {
  Event.THEME_IDS.forEach(function (id) {
    var theme = Event.resolveTheme(id);
    var expected = EXPECTED_THEMES[id];
    assert.equal(theme.id, id);
    Object.keys(expected).forEach(function (key) {
      assert.equal(theme[key], expected[key], id + "." + key);
    });
    assert.equal(Object.isFrozen(theme), true);
    [theme.primary, theme.secondary, theme.highlight, theme.background,
      theme.button, theme.border].forEach(function (colour) {
      var foreground = Event.safeForeground(colour);
      assert.ok(Event.contrastRatio(colour, foreground) >= 4.5,
        colour + " must have an AA-safe foreground");
    });
    assert.ok(Event.contrastRatio(theme.background, theme.foreground) >= 4.5,
      id + " Event Home foreground must be AA-safe");
    assert.ok(Event.contrastRatio(theme.button, theme.buttonInk) >= 4.5,
      id + " button ink must be AA-safe");
  });

  assert.equal(Event.resolveTheme({ themeId: "after-dark" }).id, "after-dark");
  assert.equal(Event.resolveTheme({ paletteId: "pink-party" }).id, "pop");
  assert.equal(Event.resolveTheme("blue-sky").id, "sunshine");
  assert.equal(Event.resolveTheme("not-a-theme").id, "pop");
  assert.throws(function () { Event.contrastRatio("tomato", "#ffffff"); }, /six-digit/i);
});

test("canonicalises every flat theme role from the id and survives persistence", function () {
  var roleMap = {
    themeName: "name", themeTagline: "tagline",
    themePrimary: "primary", themeSecondary: "secondary", themeHighlight: "highlight",
    themeBackground: "background", themeForeground: "foreground",
    themeButton: "button", themeButtonInk: "buttonInk", themeBorder: "border",
    themeDecoration: "decoration", themeTypography: "typography",
    themeStripFrame: "stripFrame", themeStripFilter: "stripFilter",
    themeMagazineTemplate: "magazineTemplate"
  };

  Event.THEME_IDS.forEach(function (id) {
    var theme = Event.resolveTheme(id);
    var supplied = { schemaVersion: 3, themeId: id };
    Object.keys(roleMap).forEach(function (key) { supplied[key] = "tampered"; });
    supplied.paletteId = "blue-sky";
    supplied.look = "butter";
    supplied.accent = "#000000";
    var created = Event.createEventConfig(supplied, fixedOptions());
    var restored = Event.createEventConfig(JSON.parse(JSON.stringify(created)));

    assert.equal(created.themeId, id);
    Object.keys(roleMap).forEach(function (key) {
      assert.equal(created[key], theme[roleMap[key]], key + " is canonical");
      assert.equal(restored[key], theme[roleMap[key]], key + " survives persistence");
    });
    ["paletteId", "palettePrimary", "paletteSecondary", "paletteHighlight",
      "look", "accent"].forEach(function (key) {
      assert.equal(created[key], undefined, key + " does not survive schema 3");
    });
  });
});

test("maps every version 1 look and version 2 palette to the nearest safe theme", function () {
  var cases = [
    [1, "look", "lilac", "pop"],
    [1, "look", "pink-purple", "pop"],
    [1, "look", "pink", "pop"],
    [1, "look", "sky", "sunshine"],
    [1, "look", "butter", "sunshine"],
    [2, "paletteId", "lilac-pop", "pop"],
    [2, "paletteId", "pink-party", "pop"],
    [2, "paletteId", "blue-sky", "sunshine"],
    [2, "paletteId", "sunshine", "sunshine"],
    [2, "paletteId", "unknown-palette", "pop"]
  ];

  cases.forEach(function (entry) {
    var legacy = { schemaVersion: entry[0], accent: "#123456", stripFrame: "film" };
    legacy[entry[1]] = entry[2];
    if (entry[0] === 2) {
      legacy.palettePrimary = "#000000";
      legacy.paletteSecondary = "#000000";
      legacy.paletteHighlight = "#000000";
    }
    var migrated = Event.migrateEventConfig(legacy, fixedOptions());
    var theme = Event.resolveTheme(entry[3]);
    assert.equal(migrated.schemaVersion, 3);
    assert.equal(migrated.themeId, entry[3]);
    assert.equal(migrated.themePrimary, theme.primary);
    assert.equal(migrated.themeBackground, theme.background);
    assert.equal(migrated.themeMagazineTemplate, theme.magazineTemplate);
    assert.equal(migrated.look, undefined);
    assert.equal(migrated.accent, undefined);
    assert.equal(migrated.paletteId, undefined);
    assert.equal(migrated.palettePrimary, undefined);
    assert.equal(migrated.stripFrame, "film", "unrelated renderer settings survive");
  });

  assert.equal(Event.migrateEventConfig({}, fixedOptions()).themeId, "pop",
    "a pre-schema event with no look receives the safe default");
  assert.equal(Event.migrateEventConfig({ schemaVersion: 2 }, fixedOptions({
    defaults: { paletteId: "blue-sky" }
  })).themeId, "sunshine", "a sparse legacy config can inherit its legacy defaults");
});

test("does not migrate or persist a plaintext PIN field", function () {
  var migrated = Event.migrateEventConfig({
    eventTitle: "Private Party",
    guestPin: "1234",
    plaintextPin: "5678",
    passcode: "9999"
  }, fixedOptions());
  var persisted = JSON.stringify(migrated);

  assert.equal(migrated.guestPin, undefined);
  assert.equal(migrated.plaintextPin, undefined);
  assert.equal(migrated.passcode, undefined);
  assert.equal(migrated.guestPinEnabled, false);
  assert.doesNotMatch(persisted, /1234|5678|9999/);
});

test("uses explicit timing precision and conservatively infers legacy timing", function () {
  assert.equal(Event.inferLegacyDatePrecision("15/08/2026"), "exact");
  assert.equal(Event.inferLegacyDatePrecision("2026-08-15"), "exact");
  assert.equal(Event.inferLegacyDatePrecision("August 2026"), "approximate");
  assert.equal(Event.inferLegacyDatePrecision("2026"), "approximate");
  assert.equal(Event.inferLegacyDatePrecision("not sure yet"), "unknown");

  assert.equal(Event.createEventConfig({
    date: "August 2026",
    datePrecision: "approximate"
  }, fixedOptions()).datePrecision, "approximate");
  assert.equal(Event.createEventConfig({
    date: "15/08/2026",
    datePrecision: "unknown"
  }, fixedOptions()).datePrecision, "unknown", "an explicit Unknown choice is never upgraded");
});

test("uses the seven accepted types and degrades an explicit unknown type to Other", function () {
  assert.equal(Event.createEventConfig({ eventType: "Baby Shower" }, fixedOptions()).eventType, "baby_shower");
  assert.equal(Event.createEventConfig({ eventType: "Hen Party" }, fixedOptions()).eventType, "other");
  assert.equal(Event.EVENT_TYPE_LABELS.other, "Other");
  assert.throws(function () {
    Event.createEventConfig({ schemaVersion: 99 }, fixedOptions());
  }, /Unsupported EventConfig schemaVersion/);
  assert.throws(function () {
    Event.createEventConfig({ schemaVersion: 1 }, fixedOptions());
  }, /Unsupported EventConfig schemaVersion/);
  assert.throws(function () {
    Event.createEventConfig({ schemaVersion: 2 }, fixedOptions());
  }, /Unsupported EventConfig schemaVersion/);
  assert.throws(function () {
    Event.migrateEventConfig({ schemaVersion: 4 }, fixedOptions());
  }, /Unsupported EventConfig schemaVersion/);
});

test("starts the 48-hour clock only through the explicit startEvent action", function () {
  var draft = Event.createEventConfig({
    eventTitle: "Sophie's Hen",
    date: "16.05.27",
    datePrecision: "exact"
  }, fixedOptions());
  var edited = Event.createEventConfig({
    eventId: draft.eventId,
    eventTitle: draft.eventTitle,
    date: "17.05.27",
    datePrecision: "exact"
  });
  var live = Event.startEvent(edited, START_MS);

  assert.equal(draft.eventStatus, "DRAFT");
  assert.equal(edited.eventStatus, "DRAFT", "editing or reaching a planned date cannot activate");
  assert.equal(live.eventStatus, "LIVE");
  assert.equal(live.activatedAt, "2027-05-16T18:00:00.000Z");
  assert.equal(live.endsAt, "2027-05-18T18:00:00.000Z");
  assert.equal(draft.activatedAt, "", "startEvent is pure and does not mutate its input");
});

test("ends at the exact 48-hour boundary and never reactivates an ended event", function () {
  var draft = Event.createEventConfig({}, fixedOptions());
  var live = Event.startEvent(draft, START_MS);
  var oneMillisecondBefore = START_MS + Event.LIVE_DURATION_MS - 1;
  var exactBoundary = START_MS + Event.LIVE_DURATION_MS;
  var ended;

  assert.equal(Event.resolveEventStatus(live, oneMillisecondBefore), "LIVE");
  assert.equal(Event.resolveEventStatus(live, exactBoundary), "ENDED");
  ended = Event.refreshEventLifecycle(live, exactBoundary);
  assert.equal(ended.eventStatus, "ENDED");
  assert.equal(live.eventStatus, "LIVE", "refresh does not mutate stored input");
  assert.throws(function () {
    Event.startEvent(ended, exactBoundary + 1);
  }, /cannot be reactivated/i);
  assert.throws(function () {
    Event.startEvent(live, START_MS + 1000);
  }, /Only a DRAFT event/);
});

test("repairs impossible lifecycle combinations without consuming a live window", function () {
  var partial = Event.createEventConfig({
    eventId: FIXED_ID,
    eventStatus: "LIVE",
    activatedAt: "",
    endsAt: "2027-05-18T18:00:00.000Z"
  });
  var tamperedEnd = Event.createEventConfig({
    eventId: FIXED_ID,
    eventStatus: "LIVE",
    activatedAt: "2027-05-16T18:00:00.000Z",
    endsAt: "2099-01-01T00:00:00.000Z"
  });

  assert.equal(partial.eventStatus, "DRAFT");
  assert.equal(partial.endsAt, "");
  assert.equal(tamperedEnd.endsAt, "2027-05-18T18:00:00.000Z");
});

test("stores only a salted SHA-256 Guest PIN verifier and verifies locally", async function () {
  var salt = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  var draft = Event.createEventConfig({ eventTitle: "Sophie's Hen" }, fixedOptions());
  var protectedEvent = await Event.enableGuestPin(draft, "2605", { saltBytes: salt });
  var serialised = JSON.stringify(protectedEvent);

  assert.equal(protectedEvent.guestPinEnabled, true);
  assert.equal(protectedEvent.guestPinAlgorithm, "SHA-256");
  assert.equal(protectedEvent.guestPinAuthority, "local_device");
  assert.match(protectedEvent.guestPinSalt, /^[A-Za-z0-9_-]+$/);
  assert.match(protectedEvent.guestPinVerifier, /^[A-Za-z0-9_-]{40,}$/);
  assert.doesNotMatch(serialised, /2605/);
  assert.equal(await Event.verifyGuestPin(protectedEvent, "2605"), true);
  assert.equal(await Event.verifyGuestPin(protectedEvent, "0000"), false);
  assert.equal(await Event.verifyGuestPin(protectedEvent, "26"), false);
  assert.equal(await Event.verifyGuestPin(Event.disableGuestPin(protectedEvent), "anything"), true);
  await assert.rejects(Event.enableGuestPin(draft, "12ab"), /exactly four digits/);
});

test("Guest PIN throttle is pure, modest and releases exactly at its boundary", function () {
  var start = 1000000;
  var original = Event.createGuestPinThrottleState();
  var state = original;
  var i;
  for (i = 0; i < 5; i += 1) {
    state = Event.recordGuestPinAttempt(state, false, start + i);
  }

  assert.deepEqual(original, { failures: 0, blockedUntil: 0 });
  assert.equal(state.failures, 5);
  assert.equal(state.blockedUntil, start + 4 + 30000);
  assert.equal(Event.guestPinThrottleStatus(state, state.blockedUntil - 1).allowed, false);
  assert.equal(Event.guestPinThrottleStatus(state, state.blockedUntil - 1).retryAfterMs, 1);
  assert.equal(Event.guestPinThrottleStatus(state, state.blockedUntil).allowed, true);
  assert.deepEqual(
    Event.recordGuestPinAttempt({ failures: 3, blockedUntil: 0 }, true, start),
    { failures: 0, blockedUntil: 0 }
  );
});

test("encodes a sparse raw Setup Pass in the URL fragment and imports it as DRAFT", async function () {
  var defaults = {
    eventTitle: "Your Celebration",
    date: "",
    themeId: "pop",
    mirror: true,
    stripSignature: ""
  };
  var config = Event.createEventConfig({
    eventId: FIXED_ID,
    eventType: "party",
    eventTitle: "Sophie's Hen",
    location: "Ibiza",
    date: "16.05.27",
    datePrecision: "exact",
    themeId: "after-dark",
    mirror: true,
    stripSignature: "SOPHIE'S HEN"
  }, { defaults: defaults });
  var fragment = await Event.encodeSetupPass(config, { defaults: defaults });
  var imported = await Event.decodeSetupPass(
    "https://mybishbash.app/photobooth/" + fragment,
    { defaults: defaults }
  );

  assert.match(fragment, /^#setup=r\.[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(fragment, /^\?/);
  assert.equal(rawSetupPayload(fragment).v, 3);
  assert.equal(imported.eventId, FIXED_ID);
  assert.equal(imported.eventTitle, "Sophie's Hen");
  assert.equal(imported.location, "Ibiza");
  assert.equal(imported.schemaVersion, 3);
  assert.equal(imported.themeId, "after-dark");
  assert.equal(imported.themePrimary, "#d86c8f");
  assert.equal(imported.themeSecondary, "#242126");
  assert.equal(imported.themeHighlight, "#eee6ff");
  assert.equal(imported.themeBackground, "#0b0b0b");
  assert.equal(imported.themeForeground, "#ffffff");
  assert.equal(imported.themeStripFrame, "black");
  assert.equal(imported.themeMagazineTemplate, "noir");
  assert.equal(imported.paletteId, undefined);
  assert.equal(imported.look, undefined);
  assert.equal(imported.accent, undefined);
  assert.equal(imported.mirror, true);
  assert.equal(imported.eventStatus, "DRAFT");
  assert.equal(imported.activatedAt, "");
  assert.equal(imported.endsAt, "");
  assert.equal(
    Event.buildSetupPassUrl("https://mybishbash.app/photobooth/#old", fragment),
    "https://mybishbash.app/photobooth/" + fragment
  );
});

test("imports version 1 and version 2 Setup Passes through theme migration", async function () {
  var fragment = rawSetupFragment({
    v: 1,
    c: {
      eventId: FIXED_ID,
      eventTitle: "Summer Party",
      look: "butter",
      accent: "#d88600",
      mirror: false,
      eventStatus: "LIVE",
      activatedAt: "2027-05-16T18:00:00.000Z",
      endsAt: "2027-05-18T18:00:00.000Z"
    }
  });
  var imported = await Event.decodeSetupPass(fragment);
  var versionTwo = await Event.decodeSetupPass(rawSetupFragment({
    v: 2,
    c: {
      eventId: "event_legacy_blue",
      eventTitle: "Legacy Blue Party",
      paletteId: "blue-sky",
      palettePrimary: "#000000",
      paletteSecondary: "#000000",
      paletteHighlight: "#000000",
      eventStatus: "LIVE",
      activatedAt: "2027-05-16T18:00:00.000Z",
      endsAt: "2027-05-18T18:00:00.000Z"
    }
  }));

  assert.equal(imported.schemaVersion, 3);
  assert.equal(imported.eventId, FIXED_ID);
  assert.equal(imported.eventTitle, "Summer Party");
  assert.equal(imported.themeId, "sunshine");
  assert.equal(imported.themePrimary, "#245f9f");
  assert.equal(imported.themeSecondary, "#dcecff");
  assert.equal(imported.themeHighlight, "#ff8b72");
  assert.equal(imported.themeBackground, "#fff0aa");
  assert.equal(imported.paletteId, undefined);
  assert.equal(imported.look, undefined);
  assert.equal(imported.accent, undefined);
  assert.equal(imported.mirror, false);
  assert.equal(imported.eventStatus, "DRAFT");
  assert.equal(imported.activatedAt, "");
  assert.equal(imported.endsAt, "");

  assert.equal(versionTwo.schemaVersion, 3);
  assert.equal(versionTwo.eventId, "event_legacy_blue");
  assert.equal(versionTwo.themeId, "sunshine");
  assert.equal(versionTwo.themePrimary, "#245f9f", "copied legacy colours are ignored");
  assert.equal(versionTwo.paletteId, undefined);
  assert.equal(versionTwo.eventStatus, "DRAFT");
  assert.equal(versionTwo.activatedAt, "");
  assert.equal(versionTwo.endsAt, "");
});

test("Setup Pass carries the derived Guest PIN fields but never its plaintext", async function () {
  var protectedEvent = await Event.enableGuestPin(
    Event.createEventConfig({ eventId: FIXED_ID }, fixedOptions()),
    "1234",
    { saltBytes: Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]) }
  );
  var fragment = await Event.encodeSetupPass(protectedEvent);
  var imported = await Event.decodeSetupPass(fragment);

  assert.doesNotMatch(fragment, /1234/);
  assert.equal(imported.guestPinEnabled, true);
  assert.equal(await Event.verifyGuestPin(imported, "1234"), true);
});

test("Setup Pass excludes photos, logos, entitlement, activation and plaintext PIN", async function () {
  var live = Event.startEvent(Event.createEventConfig({ eventId: FIXED_ID }, fixedOptions()), START_MS);
  live.photos = ["data:image/jpeg;base64,guest-photo"];
  live.guestPhoto = "data:image/jpeg;base64,guest-photo";
  live.logoImage = "data:image/png;base64,business-logo";
  live.businessBrand = { logoImage: "data:image/png;base64,business-logo" };
  live.accessToken = "server-secret-token";
  live.entitlement = "ONE_EVENT";
  live.guestPin = "9876";
  var fragment = await Event.encodeSetupPass(live);
  var imported = await Event.decodeSetupPass(fragment);

  assert.equal(imported.photos, undefined);
  assert.equal(imported.guestPhoto, undefined);
  assert.equal(imported.logoImage, undefined);
  assert.equal(imported.businessBrand, undefined);
  assert.equal(imported.accessToken, undefined);
  assert.equal(imported.entitlement, undefined);
  assert.equal(imported.guestPin, undefined);
  assert.equal(imported.eventStatus, "DRAFT");
  assert.equal(imported.activatedAt, "");
  assert.equal(imported.endsAt, "");
});

test("supports optional raw-DEFLATE Setup Passes with an honest raw fallback", async function () {
  var config = Event.createEventConfig({
    eventId: FIXED_ID,
    eventTitle: "Sophie's Very Special Hen Party Weekend Celebration",
    location: "Ibiza, Balearic Islands",
    eventLine: "Good friends, loud laughs and one brilliant weekend"
  });
  var fragment = await Event.encodeSetupPass(config, { compress: true });
  var imported = await Event.decodeSetupPass(fragment);

  assert.match(fragment, /^#setup=[rd]\.[A-Za-z0-9_-]+$/);
  assert.equal(imported.eventId, FIXED_ID);
  assert.equal(imported.eventLine, config.eventLine);
});

test("rejects query-string, malformed and unknown-version Setup Passes", async function () {
  await assert.rejects(
    Event.decodeSetupPass("https://example.test/photobooth/?setup=r.abc"),
    /URL fragment/
  );
  await assert.rejects(Event.decodeSetupPass("#setup=x.abc"), /Unknown Setup Pass encoding/);
  await assert.rejects(
    Event.decodeSetupPass(rawSetupFragment({ v: 4, c: { eventId: FIXED_ID } })),
    /Unsupported Setup Pass version: 4/
  );
  await assert.rejects(Event.decodeSetupPass("#setup=r.not-valid-json"), /not valid JSON/);
});

test("a malicious imported lifecycle cannot activate an event", async function () {
  var fragment = rawSetupFragment({
    v: 1,
    c: {
      eventId: FIXED_ID,
      eventTitle: "Sophie's Hen",
      eventStatus: "LIVE",
      activatedAt: "2027-05-16T18:00:00.000Z",
      endsAt: "2027-05-18T18:00:00.000Z",
      accessToken: "do-not-import",
      logoImage: "do-not-import"
    }
  });
  var imported = await Event.decodeSetupPass(fragment);

  assert.equal(imported.eventStatus, "DRAFT");
  assert.equal(imported.activatedAt, "");
  assert.equal(imported.endsAt, "");
  assert.equal(imported.accessToken, undefined);
  assert.equal(imported.logoImage, undefined);
});
