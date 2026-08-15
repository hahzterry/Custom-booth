/* event.js — local-first event configuration for LUMEE BOOTH Photobooth.
   This module deliberately owns no DOM, storage, renderer or checkout code.
   It provides a small, versioned boundary that those systems can integrate.

   The implementation uses a UMD wrapper and conservative JavaScript syntax
   so it can be loaded directly in the browser and required by Node tests. */
(function (root, factory) {
  "use strict";

  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      root,
      require("node:crypto"),
      require("node:zlib")
    );
  } else {
    root.MyBishBashEvent = factory(root, null, null);
  }
}(
  typeof self !== "undefined" ? self :
    (typeof globalThis !== "undefined" ? globalThis : this),
  function (root, nodeCrypto, nodeZlib) {
    "use strict";

    var own = Object.prototype.hasOwnProperty;
    var EVENT_CONFIG_SCHEMA_VERSION = 3;
    var SETUP_PASS_VERSION = 3;
    var LIVE_DURATION_MS = 48 * 60 * 60 * 1000;
    var MAX_SETUP_PASS_TOKEN_CHARS = 24000;

    var EVENT_TYPES = freeze([
      "birthday",
      "wedding",
      "baby_shower",
      "anniversary",
      "graduation",
      "party",
      "other"
    ]);

    var EVENT_TYPE_LABELS = freeze({
      birthday: "Birthday",
      wedding: "Wedding",
      baby_shower: "Baby Shower",
      anniversary: "Anniversary",
      graduation: "Graduation",
      party: "Party",
      other: "Other"
    });

    var DATE_PRECISIONS = freeze({
      EXACT: "exact",
      APPROXIMATE: "approximate",
      UNKNOWN: "unknown"
    });

    var EVENT_STATUSES = freeze({
      DRAFT: "DRAFT",
      LIVE: "LIVE",
      ENDED: "ENDED"
    });

    var GUEST_PIN_AUTHORITIES = freeze({
      LOCAL_DEVICE: "local_device"
    });

    var GUEST_PIN_ALGORITHM = "SHA-256";
    var GUEST_PIN_THROTTLE_POLICY = freeze({
      maximumFailures: 5,
      cooldownMs: 30000
    });

    /* A theme is a complete, curated treatment rather than a colour picker.
       Renderers continue to own their geometry; these stable roles select
       the existing treatments and provide the colours and surface language
       that join Event Home and all three outputs together. EventConfig keeps
       a flat canonical copy because Setup Passes intentionally carry only
       primitive configuration. The id remains authoritative for curated
       themes. A later `custom` theme mode can validate the same flat colour
       roles without changing renderer contracts or Setup Pass structure. */
    var THEMES = freeze({
      pop: {
        id: "pop",
        name: "Pop",
        tagline: "Colourful · playful · bold",
        primary: "#b52167",
        secondary: "#eee6ff",
        highlight: "#fff0aa",
        background: "#ffdce8",
        foreground: "#111111",
        button: "#b52167",
        buttonInk: "#ffffff",
        border: "#111111",
        decoration: "playful-shapes",
        typography: "bold-sans",
        stripFrame: "white",
        stripFilter: "original",
        magazineTemplate: "keepsake"
      },
      "after-dark": {
        id: "after-dark",
        name: "After Dark",
        tagline: "Dark · cool · confident",
        primary: "#d86c8f",
        secondary: "#242126",
        highlight: "#eee6ff",
        background: "#0b0b0b",
        foreground: "#ffffff",
        button: "#ffffff",
        buttonInk: "#111111",
        border: "#ffffff",
        decoration: "restrained-orbit",
        typography: "confident-sans",
        stripFrame: "black",
        stripFilter: "original",
        magazineTemplate: "noir"
      },
      editorial: {
        id: "editorial",
        name: "Editorial",
        tagline: "Clean · sophisticated · minimal",
        primary: "#756057",
        secondary: "#e7ded3",
        highlight: "#c8b5a6",
        background: "#f8f5ef",
        foreground: "#111111",
        button: "#111111",
        buttonInk: "#ffffff",
        border: "#111111",
        decoration: "fine-rule",
        typography: "editorial-serif",
        stripFrame: "editorial",
        stripFilter: "original",
        magazineTemplate: "editorial"
      },
      sunshine: {
        id: "sunshine",
        name: "Sunshine",
        tagline: "Bright · warm · optimistic",
        primary: "#245f9f",
        secondary: "#dcecff",
        highlight: "#ff8b72",
        background: "#fff0aa",
        foreground: "#111111",
        button: "#245f9f",
        buttonInk: "#ffffff",
        border: "#111111",
        decoration: "sunburst",
        typography: "bright-sans",
        stripFrame: "white",
        stripFilter: "warm",
        magazineTemplate: "press"
      }
    });

    var THEME_IDS = freeze([
      "pop",
      "after-dark",
      "editorial",
      "sunshine"
    ]);

    var LEGACY_THEME_IDS = freeze({
      pop: "pop",
      "lilac-pop": "pop",
      "pink-party": "pop",
      lilac: "pop",
      pink: "pop",
      "pink-purple": "pop",
      "after-dark": "after-dark",
      editorial: "editorial",
      sunshine: "sunshine",
      "blue-sky": "sunshine",
      sky: "sunshine",
      butter: "sunshine"
    });

    /* These fields are additive to app.js' existing flat settings object.
       Passing the old DEFAULTS object to createEventConfig's `defaults`
       option keeps the complete old renderer/settings contract intact. */
    var EVENT_FIELD_DEFAULTS = freeze({
      schemaVersion: EVENT_CONFIG_SCHEMA_VERSION,
      eventId: "",
      eventType: "birthday",
      eventTitle: "Your Celebration",
      location: "",
      eventLine: "",
      date: "",
      datePrecision: DATE_PRECISIONS.UNKNOWN,
      themeId: "pop",
      themeName: THEMES.pop.name,
      themeTagline: THEMES.pop.tagline,
      themePrimary: THEMES.pop.primary,
      themeSecondary: THEMES.pop.secondary,
      themeHighlight: THEMES.pop.highlight,
      themeBackground: THEMES.pop.background,
      themeForeground: THEMES.pop.foreground,
      themeButton: THEMES.pop.button,
      themeButtonInk: THEMES.pop.buttonInk,
      themeBorder: THEMES.pop.border,
      themeDecoration: THEMES.pop.decoration,
      themeTypography: THEMES.pop.typography,
      themeStripFrame: THEMES.pop.stripFrame,
      themeStripFilter: THEMES.pop.stripFilter,
      themeMagazineTemplate: THEMES.pop.magazineTemplate,
      eventStatus: EVENT_STATUSES.DRAFT,
      activatedAt: "",
      endsAt: "",
      guestPinEnabled: false,
      guestPinAlgorithm: GUEST_PIN_ALGORITHM,
      guestPinAuthority: GUEST_PIN_AUTHORITIES.LOCAL_DEVICE,
      guestPinSalt: "",
      guestPinVerifier: ""
    });

    function has(object, key) {
      return !!object && own.call(object, key);
    }

    function freeze(value) {
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
        freeze(value[keys[i]]);
      }
      return Object.freeze(value);
    }

    function isPlainObject(value) {
      var prototype;
      if (!value || Object.prototype.toString.call(value) !== "[object Object]") {
        return false;
      }
      prototype = Object.getPrototypeOf ? Object.getPrototypeOf(value) : Object.prototype;
      return prototype === Object.prototype || prototype === null;
    }

    function cloneObject(source) {
      var output = {};
      Object.keys(source || {}).forEach(function (key) {
        if (!isDangerousKey(key)) {
          output[key] = source[key];
        }
      });
      return output;
    }

    function trimmed(value) {
      return typeof value === "string" ? value.replace(/^\s+|\s+$/g, "") : "";
    }

    function isPrimitive(value) {
      return typeof value === "string" || typeof value === "number" ||
        typeof value === "boolean";
    }

    function isDangerousKey(key) {
      return key === "__proto__" || key === "prototype" || key === "constructor";
    }

    function normalKey(key) {
      return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function isPlaintextPinKey(key) {
      var normal = normalKey(key);
      var derived = {
        guestpinenabled: true,
        guestpinalgorithm: true,
        guestpinauthority: true,
        guestpinsalt: true,
        guestpinverifier: true
      };
      if (derived[normal]) {
        return false;
      }
      return normal === "pin" || normal === "guestpin" ||
        normal === "pinplaintext" || normal === "plaintextpin" ||
        normal === "guestpinplaintext" || normal === "rawpin" ||
        normal === "guestpinraw" || normal === "pincode" ||
        normal === "guestpincode" || normal === "passcode" ||
        normal === "guestpasscode" || normal === "eventpin" ||
        normal === "eventpincode";
    }

    function copyPrimitiveFields(target, source) {
      if (!isPlainObject(source)) {
        return target;
      }
      Object.keys(source).forEach(function (key) {
        var value = source[key];
        if (!isDangerousKey(key) && !isPlaintextPinKey(key) && isPrimitive(value)) {
          target[key] = value;
        }
      });
      return target;
    }

    function validIdentifier(value) {
      var text = trimmed(value);
      return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(text) ? text : "";
    }

    function normaliseEventType(value, wasSupplied) {
      var text = trimmed(value).toLowerCase().replace(/[\s-]+/g, "_");
      if (EVENT_TYPES.indexOf(text) !== -1) {
        return text;
      }
      /* Missing legacy type preserves the existing Birthday generation voice.
         An explicitly unknown new type degrades to Other instead of inferring
         an occasion from a person's name or a trailing word. */
      return wasSupplied ? "other" : "birthday";
    }

    function legacyThemeId(value) {
      var text = trimmed(value).toLowerCase();
      return LEGACY_THEME_IDS[text] || EVENT_FIELD_DEFAULTS.themeId;
    }

    function normaliseThemeId(value) {
      var text = trimmed(value).toLowerCase();
      return has(THEMES, text) ? text : legacyThemeId(text);
    }

    function resolveTheme(value) {
      var id = value;
      if (isPlainObject(value)) {
        id = trimmed(value.themeId) ? value.themeId :
          (has(value, "paletteId") ? value.paletteId : value.look);
      }
      return THEMES[normaliseThemeId(id)];
    }

    function applyCanonicalTheme(config) {
      var theme = resolveTheme(config);
      var fields = {
        themeId: "id",
        themeName: "name",
        themeTagline: "tagline",
        themePrimary: "primary",
        themeSecondary: "secondary",
        themeHighlight: "highlight",
        themeBackground: "background",
        themeForeground: "foreground",
        themeButton: "button",
        themeButtonInk: "buttonInk",
        themeBorder: "border",
        themeDecoration: "decoration",
        themeTypography: "typography",
        themeStripFrame: "stripFrame",
        themeStripFilter: "stripFilter",
        themeMagazineTemplate: "magazineTemplate"
      };
      Object.keys(fields).forEach(function (key) {
        config[key] = theme[fields[key]];
      });
      /* Version 1 stored look/accent and version 2 stored a palette id plus
         three copied colours. They are migration inputs only and never
         survive in a version 3 EventConfig. */
      delete config.paletteId;
      delete config.palettePrimary;
      delete config.paletteSecondary;
      delete config.paletteHighlight;
      delete config.look;
      delete config.accent;
      return config;
    }

    function colourLuminance(value) {
      var match = /^#([0-9a-f]{6})$/i.exec(String(value || ""));
      var channels;
      if (!match) {
        throw new TypeError("A six-digit hexadecimal colour is required.");
      }
      channels = [0, 2, 4].map(function (index) {
        return parseInt(match[1].slice(index, index + 2), 16) / 255;
      }).map(function (channel) {
        return channel <= 0.03928 ? channel / 12.92 :
          Math.pow((channel + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    }

    function contrastRatio(first, second) {
      var a = colourLuminance(first);
      var b = colourLuminance(second);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }

    function safeForeground(background) {
      return contrastRatio(background, "#111111") >=
        contrastRatio(background, "#ffffff") ? "#111111" : "#ffffff";
    }

    function inferLegacyDatePrecision(value) {
      var text = trimmed(value);
      var months = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
      if (!text) {
        return DATE_PRECISIONS.UNKNOWN;
      }
      if (/^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}$/.test(text) ||
          /^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return DATE_PRECISIONS.EXACT;
      }
      if (new RegExp("^(?:" + months + ")\\s+\\d{4}$", "i").test(text) ||
          /^\d{4}$/.test(text)) {
        return DATE_PRECISIONS.APPROXIMATE;
      }
      return DATE_PRECISIONS.UNKNOWN;
    }

    function normaliseDatePrecision(value, date, wasSupplied) {
      var text = trimmed(value).toLowerCase();
      if (!wasSupplied) {
        return inferLegacyDatePrecision(date);
      }
      if (text === DATE_PRECISIONS.EXACT || text === DATE_PRECISIONS.APPROXIMATE ||
          text === DATE_PRECISIONS.UNKNOWN) {
        return text;
      }
      return DATE_PRECISIONS.UNKNOWN;
    }

    function randomBytes(length, options) {
      var bytes;
      var supplied = options && options.randomBytes;
      if (typeof supplied === "function") {
        bytes = supplied(length);
        bytes = byteView(bytes);
        if (!bytes || bytes.length !== length) {
          throw new TypeError("randomBytes must return exactly " + length + " bytes.");
        }
        return bytes;
      }
      if (nodeCrypto && typeof nodeCrypto.randomBytes === "function") {
        return byteView(nodeCrypto.randomBytes(length));
      }
      if (root && root.crypto && typeof root.crypto.getRandomValues === "function") {
        bytes = new Uint8Array(length);
        root.crypto.getRandomValues(bytes);
        return bytes;
      }
      throw new Error("Secure random bytes are unavailable in this browser.");
    }

    function generateEventId(options) {
      return "event_" + base64UrlEncode(randomBytes(16, options));
    }

    function normaliseLifecycle(config) {
      var status = trimmed(config.eventStatus).toUpperCase();
      var activated;
      var activatedMs;

      if (status !== EVENT_STATUSES.LIVE && status !== EVENT_STATUSES.ENDED) {
        config.eventStatus = EVENT_STATUSES.DRAFT;
        config.activatedAt = "";
        config.endsAt = "";
        return config;
      }

      activated = trimmed(config.activatedAt);
      activatedMs = Date.parse(activated);
      if (!activated || !isFinite(activatedMs)) {
        /* An impossible partial state must fail closed to DRAFT. It must not
           accidentally consume an event window or invent an activation. */
        config.eventStatus = EVENT_STATUSES.DRAFT;
        config.activatedAt = "";
        config.endsAt = "";
        return config;
      }

      config.eventStatus = status;
      config.activatedAt = new Date(activatedMs).toISOString();
      config.endsAt = new Date(activatedMs + LIVE_DURATION_MS).toISOString();
      return config;
    }

    function normaliseGuestPinFields(config) {
      var enabled = config.guestPinEnabled === true;
      var salt = trimmed(config.guestPinSalt);
      var verifier = trimmed(config.guestPinVerifier);
      var validDerived = /^[A-Za-z0-9_-]{8,}$/.test(salt) &&
        /^[A-Za-z0-9_-]{40,}$/.test(verifier);

      config.guestPinAlgorithm = GUEST_PIN_ALGORITHM;
      config.guestPinAuthority = GUEST_PIN_AUTHORITIES.LOCAL_DEVICE;
      config.guestPinEnabled = enabled && validDerived;
      if (!config.guestPinEnabled) {
        config.guestPinSalt = "";
        config.guestPinVerifier = "";
      } else {
        config.guestPinSalt = salt;
        config.guestPinVerifier = verifier;
      }
      return config;
    }

    function createEventConfig(source, options) {
      var input = source || {};
      var opts = options || {};
      var config = {};
      var suppliedSchema;
      var suppliedId;
      var idFactory;

      if (!isPlainObject(input)) {
        throw new TypeError("EventConfig source must be a plain object.");
      }
      suppliedSchema = has(input, "schemaVersion") ? Number(input.schemaVersion) : null;
      if (suppliedSchema !== null && suppliedSchema !== EVENT_CONFIG_SCHEMA_VERSION) {
        throw new RangeError("Unsupported EventConfig schemaVersion: " + String(input.schemaVersion));
      }

      copyPrimitiveFields(config, EVENT_FIELD_DEFAULTS);
      copyPrimitiveFields(config, opts.defaults || {});
      copyPrimitiveFields(config, input);

      config.schemaVersion = EVENT_CONFIG_SCHEMA_VERSION;
      config.eventType = normaliseEventType(
        config.eventType,
        has(input, "eventType") || has(opts.defaults, "eventType")
      );
      config.eventTitle = trimmed(config.eventTitle) || EVENT_FIELD_DEFAULTS.eventTitle;
      config.location = trimmed(config.location);
      config.eventLine = trimmed(config.eventLine);
      config.date = trimmed(config.date);
      config.datePrecision = normaliseDatePrecision(
        config.datePrecision,
        config.date,
        has(input, "datePrecision") || has(opts.defaults, "datePrecision")
      );
      applyCanonicalTheme(config);

      suppliedId = validIdentifier(config.eventId);
      if (!suppliedId) {
        idFactory = typeof opts.idFactory === "function" ? opts.idFactory : generateEventId;
        suppliedId = validIdentifier(idFactory(opts));
        if (!suppliedId) {
          throw new TypeError("idFactory must return a valid EventConfig eventId.");
        }
      }
      config.eventId = suppliedId;

      normaliseLifecycle(config);
      normaliseGuestPinFields(config);
      return config;
    }

    function migrateEventConfig(source, options) {
      var input = source || {};
      var defaults = options && options.defaults || {};
      var suppliedSchema;
      var migrated;
      if (!isPlainObject(input)) {
        throw new TypeError("EventConfig source must be a plain object.");
      }
      suppliedSchema = has(input, "schemaVersion") ? Number(input.schemaVersion) : null;
      if (suppliedSchema !== null && suppliedSchema !== 1 && suppliedSchema !== 2 &&
          suppliedSchema !== EVENT_CONFIG_SCHEMA_VERSION) {
        throw new RangeError("Unsupported EventConfig schemaVersion: " + String(input.schemaVersion));
      }
      migrated = cloneObject(input);
      if (!trimmed(migrated.themeId)) {
        if (has(migrated, "paletteId")) {
          migrated.themeId = legacyThemeId(migrated.paletteId);
        } else if (has(migrated, "look")) {
          migrated.themeId = legacyThemeId(migrated.look);
        } else if (has(defaults, "themeId")) {
          migrated.themeId = normaliseThemeId(defaults.themeId);
        } else if (has(defaults, "paletteId")) {
          migrated.themeId = legacyThemeId(defaults.paletteId);
        } else if (has(defaults, "look")) {
          migrated.themeId = legacyThemeId(defaults.look);
        } else {
          migrated.themeId = EVENT_FIELD_DEFAULTS.themeId;
        }
      }
      migrated.schemaVersion = EVENT_CONFIG_SCHEMA_VERSION;
      delete migrated.paletteId;
      delete migrated.palettePrimary;
      delete migrated.paletteSecondary;
      delete migrated.paletteHighlight;
      delete migrated.look;
      delete migrated.accent;
      return createEventConfig(migrated, options);
    }

    function epochMilliseconds(value) {
      var number;
      if (value === undefined || value === null) {
        return Date.now();
      }
      if (value instanceof Date) {
        number = value.getTime();
      } else if (typeof value === "number") {
        number = value;
      } else {
        number = Date.parse(value);
      }
      if (!isFinite(number)) {
        throw new TypeError("A valid event time is required.");
      }
      return number;
    }

    function resolveEventStatus(config, now) {
      var current = createEventConfig(config);
      var nowMs;
      var endMs;
      if (current.eventStatus !== EVENT_STATUSES.LIVE) {
        return current.eventStatus;
      }
      nowMs = epochMilliseconds(now);
      endMs = Date.parse(current.activatedAt) + LIVE_DURATION_MS;
      return nowMs >= endMs ? EVENT_STATUSES.ENDED : EVENT_STATUSES.LIVE;
    }

    function refreshEventLifecycle(config, now) {
      var current = createEventConfig(config);
      var output = cloneObject(current);
      output.eventStatus = resolveEventStatus(current, now);
      return output;
    }

    function startEvent(config, now) {
      var nowMs = epochMilliseconds(now);
      var current = refreshEventLifecycle(config, nowMs);
      var output;
      if (current.eventStatus !== EVENT_STATUSES.DRAFT) {
        throw new Error("Only a DRAFT event can be started. ENDED events cannot be reactivated.");
      }
      output = cloneObject(current);
      output.eventStatus = EVENT_STATUSES.LIVE;
      output.activatedAt = new Date(nowMs).toISOString();
      output.endsAt = new Date(nowMs + LIVE_DURATION_MS).toISOString();
      return output;
    }

    function validGuestPin(pin) {
      return typeof pin === "string" && /^\d{4}$/.test(pin);
    }

    function byteView(value) {
      if (!value) {
        return null;
      }
      if (value instanceof Uint8Array) {
        return value;
      }
      if (Object.prototype.toString.call(value) === "[object ArrayBuffer]") {
        return new Uint8Array(value);
      }
      if (typeof value.length === "number") {
        return new Uint8Array(value);
      }
      if (typeof value.byteLength === "number" && value.buffer) {
        return new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength);
      }
      return null;
    }

    function utf8Encode(text) {
      var source = String(text);
      var bytes = [];
      var i;
      var code;
      var next;
      for (i = 0; i < source.length; i += 1) {
        code = source.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdbff && i + 1 < source.length) {
          next = source.charCodeAt(i + 1);
          if (next >= 0xdc00 && next <= 0xdfff) {
            code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
            i += 1;
          }
        }
        if (code <= 0x7f) {
          bytes.push(code);
        } else if (code <= 0x7ff) {
          bytes.push(0xc0 | (code >> 6));
          bytes.push(0x80 | (code & 0x3f));
        } else if (code <= 0xffff) {
          bytes.push(0xe0 | (code >> 12));
          bytes.push(0x80 | ((code >> 6) & 0x3f));
          bytes.push(0x80 | (code & 0x3f));
        } else {
          bytes.push(0xf0 | (code >> 18));
          bytes.push(0x80 | ((code >> 12) & 0x3f));
          bytes.push(0x80 | ((code >> 6) & 0x3f));
          bytes.push(0x80 | (code & 0x3f));
        }
      }
      return new Uint8Array(bytes);
    }

    function utf8Decode(bytes) {
      var source = byteView(bytes);
      var output = "";
      var i = 0;
      var first;
      var code;
      if (!source) {
        throw new TypeError("Setup Pass bytes are invalid.");
      }
      while (i < source.length) {
        first = source[i];
        i += 1;
        if (first < 0x80) {
          code = first;
        } else if (first >= 0xc2 && first < 0xe0 && i < source.length) {
          code = ((first & 0x1f) << 6) | (source[i] & 0x3f);
          i += 1;
        } else if (first >= 0xe0 && first < 0xf0 && i + 1 < source.length) {
          code = ((first & 0x0f) << 12) | ((source[i] & 0x3f) << 6) |
            (source[i + 1] & 0x3f);
          i += 2;
        } else if (first >= 0xf0 && first < 0xf5 && i + 2 < source.length) {
          code = ((first & 0x07) << 18) | ((source[i] & 0x3f) << 12) |
            ((source[i + 1] & 0x3f) << 6) | (source[i + 2] & 0x3f);
          i += 3;
        } else {
          throw new Error("Setup Pass contains malformed UTF-8.");
        }
        if (code <= 0xffff) {
          output += String.fromCharCode(code);
        } else {
          code -= 0x10000;
          output += String.fromCharCode(0xd800 + (code >> 10));
          output += String.fromCharCode(0xdc00 + (code & 0x3ff));
        }
      }
      return output;
    }

    function base64UrlEncode(bytes) {
      var source = byteView(bytes);
      var binary = "";
      var i;
      var base64;
      if (!source) {
        throw new TypeError("Bytes are required for base64url encoding.");
      }
      if (typeof Buffer !== "undefined") {
        return Buffer.from(source).toString("base64")
          .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      }
      for (i = 0; i < source.length; i += 1) {
        binary += String.fromCharCode(source[i]);
      }
      base64 = root.btoa(binary);
      return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }

    function base64UrlDecode(text) {
      var clean = String(text || "");
      var padded;
      var binary;
      var bytes;
      var i;
      if (!clean || !/^[A-Za-z0-9_-]+$/.test(clean)) {
        throw new Error("Setup Pass contains invalid base64url data.");
      }
      padded = clean.replace(/-/g, "+").replace(/_/g, "/");
      while (padded.length % 4) {
        padded += "=";
      }
      if (typeof Buffer !== "undefined") {
        return new Uint8Array(Buffer.from(padded, "base64"));
      }
      binary = root.atob(padded);
      bytes = new Uint8Array(binary.length);
      for (i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }

    function sha256(bytes) {
      var source = byteView(bytes);
      var subtle = root && root.crypto && root.crypto.subtle;
      if (subtle && typeof subtle.digest === "function") {
        return subtle.digest("SHA-256", source).then(function (digest) {
          return new Uint8Array(digest);
        });
      }
      if (nodeCrypto && nodeCrypto.webcrypto && nodeCrypto.webcrypto.subtle) {
        return nodeCrypto.webcrypto.subtle.digest("SHA-256", source).then(function (digest) {
          return new Uint8Array(digest);
        });
      }
      if (nodeCrypto && typeof nodeCrypto.createHash === "function") {
        return Promise.resolve(byteView(
          nodeCrypto.createHash("sha256").update(Buffer.from(source)).digest()
        ));
      }
      return Promise.reject(new Error("SHA-256 is unavailable in this browser."));
    }

    function guestPinDigestInput(pin, salt) {
      return utf8Encode("mybishbash.guest-pin.v1\u0000" + salt + "\u0000" + pin);
    }

    function deriveGuestPinVerifier(pin, salt) {
      if (!validGuestPin(pin)) {
        return Promise.reject(new TypeError("Guest PIN must contain exactly four digits."));
      }
      if (!/^[A-Za-z0-9_-]{8,}$/.test(String(salt || ""))) {
        return Promise.reject(new TypeError("Guest PIN salt is invalid."));
      }
      return sha256(guestPinDigestInput(pin, salt)).then(base64UrlEncode);
    }

    function enableGuestPin(config, pin, options) {
      var opts = options || {};
      var current;
      var saltBytes;
      var salt;
      if (!validGuestPin(pin)) {
        return Promise.reject(new TypeError("Guest PIN must contain exactly four digits."));
      }
      current = createEventConfig(config, opts);
      saltBytes = opts.saltBytes ? byteView(opts.saltBytes) : randomBytes(16, opts);
      if (!saltBytes || saltBytes.length < 12) {
        return Promise.reject(new TypeError("Guest PIN salt must contain at least 12 random bytes."));
      }
      salt = base64UrlEncode(saltBytes);
      return deriveGuestPinVerifier(pin, salt).then(function (verifier) {
        var output = cloneObject(current);
        output.guestPinEnabled = true;
        output.guestPinAlgorithm = GUEST_PIN_ALGORITHM;
        output.guestPinAuthority = GUEST_PIN_AUTHORITIES.LOCAL_DEVICE;
        output.guestPinSalt = salt;
        output.guestPinVerifier = verifier;
        return output;
      });
    }

    function disableGuestPin(config, options) {
      var output = cloneObject(createEventConfig(config, options));
      output.guestPinEnabled = false;
      output.guestPinSalt = "";
      output.guestPinVerifier = "";
      return output;
    }

    function constantTimeStringEqual(left, right) {
      var a = String(left || "");
      var b = String(right || "");
      var length = Math.max(a.length, b.length);
      var mismatch = a.length ^ b.length;
      var i;
      for (i = 0; i < length; i += 1) {
        mismatch |= (a.charCodeAt(i % (a.length || 1)) || 0) ^
          (b.charCodeAt(i % (b.length || 1)) || 0);
      }
      return mismatch === 0;
    }

    function verifyGuestPin(config, pin) {
      var current = createEventConfig(config);
      if (!current.guestPinEnabled) {
        return Promise.resolve(true);
      }
      if (current.guestPinAuthority !== GUEST_PIN_AUTHORITIES.LOCAL_DEVICE ||
          current.guestPinAlgorithm !== GUEST_PIN_ALGORITHM || !validGuestPin(pin)) {
        return Promise.resolve(false);
      }
      return deriveGuestPinVerifier(pin, current.guestPinSalt).then(function (verifier) {
        return constantTimeStringEqual(verifier, current.guestPinVerifier);
      });
    }

    function createGuestPinThrottleState() {
      return { failures: 0, blockedUntil: 0 };
    }

    function normaliseThrottleState(state, nowMs) {
      var source = state || {};
      var failures = Number(source.failures);
      var blockedUntil = Number(source.blockedUntil);
      var output = {
        failures: isFinite(failures) && failures >= 0 ? Math.floor(failures) : 0,
        blockedUntil: isFinite(blockedUntil) && blockedUntil > 0 ? blockedUntil : 0
      };
      if (output.blockedUntil > 0 && nowMs >= output.blockedUntil) {
        output.failures = 0;
        output.blockedUntil = 0;
      }
      return output;
    }

    function guestPinThrottleStatus(state, now) {
      var nowMs = epochMilliseconds(now);
      var current = normaliseThrottleState(state, nowMs);
      var retry = Math.max(0, current.blockedUntil - nowMs);
      return {
        allowed: retry === 0,
        retryAfterMs: retry,
        failures: current.failures,
        attemptsRemaining: retry > 0 ? 0 : Math.max(
          0,
          GUEST_PIN_THROTTLE_POLICY.maximumFailures - current.failures
        )
      };
    }

    function recordGuestPinAttempt(state, matched, now) {
      var nowMs = epochMilliseconds(now);
      var current = normaliseThrottleState(state, nowMs);
      if (current.blockedUntil > nowMs) {
        return current;
      }
      if (matched === true) {
        return createGuestPinThrottleState();
      }
      current.failures += 1;
      if (current.failures >= GUEST_PIN_THROTTLE_POLICY.maximumFailures) {
        current.blockedUntil = nowMs + GUEST_PIN_THROTTLE_POLICY.cooldownMs;
      }
      return current;
    }

    function isForbiddenSetupKey(key) {
      var normal = normalKey(key);
      var exact = {
        eventstatus: true,
        activatedat: true,
        endsat: true,
        photos: true,
        photo: true,
        photodata: true,
        photourl: true,
        photoimage: true,
        guestphotos: true,
        guestphoto: true,
        guestoutputs: true,
        guestoutput: true,
        capturedphotos: true,
        capturedphoto: true,
        gallery: true,
        sessions: true,
        videos: true,
        video: true,
        blobs: true,
        blob: true,
        access: true,
        accesstoken: true,
        accesstokenexpiresat: true,
        entitlement: true,
        entitlementauthority: true,
        checkoutsession: true,
        payment: true
      };
      if (isDangerousKey(key) || isPlaintextPinKey(key) || exact[normal]) {
        return true;
      }
      return normal.indexOf("logo") !== -1 || normal.indexOf("secret") !== -1 ||
        normal.indexOf("accesstoken") !== -1 || normal.indexOf("checkout") !== -1 ||
        normal.indexOf("payment") !== -1;
    }

    function safeSetupValue(value) {
      if (!isPrimitive(value)) {
        return false;
      }
      if (typeof value === "number" && !isFinite(value)) {
        return false;
      }
      if (typeof value === "string") {
        if (value.length > 4096 || /^(?:data|blob):/i.test(value)) {
          return false;
        }
      }
      return true;
    }

    function safeSetupFields(source) {
      var output = {};
      if (!isPlainObject(source)) {
        throw new TypeError("Setup Pass configuration must be a plain object.");
      }
      Object.keys(source).sort().forEach(function (key) {
        if (!isForbiddenSetupKey(key) && safeSetupValue(source[key])) {
          output[key] = source[key];
        }
      });
      return output;
    }

    function setupBaseline(defaults) {
      var baseline = {};
      copyPrimitiveFields(baseline, EVENT_FIELD_DEFAULTS);
      copyPrimitiveFields(baseline, defaults || {});
      baseline.schemaVersion = EVENT_CONFIG_SCHEMA_VERSION;
      applyCanonicalTheme(baseline);
      baseline.eventId = "";
      baseline.eventStatus = EVENT_STATUSES.DRAFT;
      baseline.activatedAt = "";
      baseline.endsAt = "";
      return baseline;
    }

    function createSparseSetupConfig(config, options) {
      var opts = options || {};
      var current = migrateEventConfig(config, opts);
      var baseline = setupBaseline(opts.defaults);
      var safe = safeSetupFields(current);
      var sparse = {};
      Object.keys(safe).sort().forEach(function (key) {
        if (key === "schemaVersion") {
          return;
        }
        if (!has(baseline, key) || safe[key] !== baseline[key] || key === "eventId") {
          sparse[key] = safe[key];
        }
      });
      return sparse;
    }

    function deflateRaw(bytes) {
      var source = byteView(bytes);
      if (nodeZlib && typeof nodeZlib.deflateRaw === "function") {
        return new Promise(function (resolve, reject) {
          nodeZlib.deflateRaw(Buffer.from(source), function (error, result) {
            if (error) {
              reject(error);
            } else {
              resolve(byteView(result));
            }
          });
        });
      }
      if (root && typeof root.CompressionStream === "function" &&
          typeof root.Blob === "function" && typeof root.Response === "function") {
        try {
          return new root.Response(
            new root.Blob([source]).stream().pipeThrough(new root.CompressionStream("deflate-raw"))
          ).arrayBuffer().then(function (buffer) {
            return new Uint8Array(buffer);
          });
        } catch (error) {
          return Promise.reject(error);
        }
      }
      return Promise.reject(new Error("Raw DEFLATE compression is unavailable."));
    }

    function inflateRaw(bytes) {
      var source = byteView(bytes);
      if (nodeZlib && typeof nodeZlib.inflateRaw === "function") {
        return new Promise(function (resolve, reject) {
          nodeZlib.inflateRaw(Buffer.from(source), function (error, result) {
            if (error) {
              reject(error);
            } else {
              resolve(byteView(result));
            }
          });
        });
      }
      if (root && typeof root.DecompressionStream === "function" &&
          typeof root.Blob === "function" && typeof root.Response === "function") {
        try {
          return new root.Response(
            new root.Blob([source]).stream().pipeThrough(new root.DecompressionStream("deflate-raw"))
          ).arrayBuffer().then(function (buffer) {
            return new Uint8Array(buffer);
          });
        } catch (error) {
          return Promise.reject(error);
        }
      }
      return Promise.reject(new Error(
        "This compressed Setup Pass is not supported in this browser. Use an uncompressed Setup Pass."
      ));
    }

    function setupPassPayload(config, options) {
      return {
        v: SETUP_PASS_VERSION,
        c: createSparseSetupConfig(config, options)
      };
    }

    /* Raw JSON/base64url is the compatibility-first default. Callers may opt
       into raw DEFLATE; if the platform cannot provide it, the encoder falls
       back to the explicit `r.` form instead of pretending it compressed. */
    function encodeSetupPass(config, options) {
      var opts = options || {};
      var bytes = utf8Encode(JSON.stringify(setupPassPayload(config, opts)));
      var raw = "#setup=r." + base64UrlEncode(bytes);
      if (opts.compress !== true) {
        return Promise.resolve(raw);
      }
      return deflateRaw(bytes).then(function (compressed) {
        if (!compressed || compressed.length >= bytes.length) {
          return raw;
        }
        return "#setup=d." + base64UrlEncode(compressed);
      }).catch(function () {
        return raw;
      });
    }

    function setupTokenFromInput(input) {
      var text = trimmed(input);
      var hashAt;
      var fragment;
      var parts;
      var i;
      var pair;
      if (!text) {
        throw new Error("A Setup Pass URL fragment is required.");
      }
      hashAt = text.indexOf("#");
      if (hashAt !== -1) {
        fragment = text.slice(hashAt + 1);
      } else if (text.charAt(0) === "#") {
        fragment = text.slice(1);
      } else if (/^[rd]\./.test(text)) {
        return text;
      } else {
        throw new Error("Setup Pass data must be carried in a URL fragment.");
      }
      parts = fragment.split("&");
      for (i = 0; i < parts.length; i += 1) {
        pair = parts[i].split("=");
        if (decodeURIComponent(pair.shift() || "") === "setup") {
          return decodeURIComponent(pair.join("="));
        }
      }
      throw new Error("The URL fragment does not contain a Setup Pass.");
    }

    function parseSetupPayload(bytes, options) {
      var payload;
      var safe;
      var config;
      try {
        payload = JSON.parse(utf8Decode(bytes));
      } catch (error) {
        throw new Error("Setup Pass payload is not valid JSON: " + error.message);
      }
      if (!isPlainObject(payload) ||
          (payload.v !== 1 && payload.v !== 2 && payload.v !== SETUP_PASS_VERSION)) {
        throw new RangeError(
          "Unsupported Setup Pass version: " + String(payload && payload.v)
        );
      }
      safe = safeSetupFields(payload.c);
      if (payload.v === 1 || payload.v === 2) {
        /* Versions 1 and 2 omitted the EventConfig schema from their sparse
           payloads. Version 1 carried look/accent; version 2 carried the
           curated palette id and copied colours. Route both through the same
           migration used for their saved EventConfig versions. */
        safe.schemaVersion = payload.v;
        config = migrateEventConfig(safe, options);
      } else {
        safe.schemaVersion = EVENT_CONFIG_SCHEMA_VERSION;
        config = createEventConfig(safe, options);
      }
      /* A Setup Pass moves configuration only. Importing one never starts an
         event, restores an entitlement, or carries a previous live clock. */
      config.eventStatus = EVENT_STATUSES.DRAFT;
      config.activatedAt = "";
      config.endsAt = "";
      return config;
    }

    function decodeSetupPass(input, options) {
      var token;
      try {
        token = setupTokenFromInput(input);
      } catch (error) {
        return Promise.reject(error);
      }
      var separator = token.indexOf(".");
      var encoding = separator === -1 ? "" : token.slice(0, separator);
      var encoded = separator === -1 ? "" : token.slice(separator + 1);
      var bytes;
      if (token.length > MAX_SETUP_PASS_TOKEN_CHARS) {
        return Promise.reject(new Error("Setup Pass is too large."));
      }
      try {
        bytes = base64UrlDecode(encoded);
      } catch (error) {
        return Promise.reject(error);
      }
      if (encoding === "r") {
        try {
          return Promise.resolve(parseSetupPayload(bytes, options));
        } catch (error) {
          return Promise.reject(error);
        }
      }
      if (encoding === "d") {
        return inflateRaw(bytes).then(function (inflated) {
          return parseSetupPayload(inflated, options);
        });
      }
      return Promise.reject(new RangeError("Unknown Setup Pass encoding: " + encoding));
    }

    function buildSetupPassUrl(baseUrl, fragment) {
      var base = String(baseUrl || "").split("#")[0];
      var setup = String(fragment || "");
      if (!base || setup.indexOf("#setup=") !== 0) {
        throw new TypeError("A base URL and encoded Setup Pass fragment are required.");
      }
      return base + setup;
    }

    return freeze({
      VERSION: "3.0.0",
      EVENT_CONFIG_SCHEMA_VERSION: EVENT_CONFIG_SCHEMA_VERSION,
      SETUP_PASS_VERSION: SETUP_PASS_VERSION,
      LIVE_DURATION_MS: LIVE_DURATION_MS,
      EVENT_TYPES: EVENT_TYPES,
      EVENT_TYPE_LABELS: EVENT_TYPE_LABELS,
      DATE_PRECISIONS: DATE_PRECISIONS,
      EVENT_STATUSES: EVENT_STATUSES,
      GUEST_PIN_AUTHORITIES: GUEST_PIN_AUTHORITIES,
      GUEST_PIN_ALGORITHM: GUEST_PIN_ALGORITHM,
      GUEST_PIN_THROTTLE_POLICY: GUEST_PIN_THROTTLE_POLICY,
      THEMES: THEMES,
      THEME_IDS: THEME_IDS,
      /* Temporary API-name aliases keep older callers functional while the
         product shell moves from palette language to theme language. Values
         are the new theme registry; old ids resolve through resolveTheme. */
      PALETTES: THEMES,
      PALETTE_IDS: THEME_IDS,
      EVENT_FIELD_DEFAULTS: EVENT_FIELD_DEFAULTS,
      resolveTheme: resolveTheme,
      resolvePalette: resolveTheme,
      contrastRatio: contrastRatio,
      safeForeground: safeForeground,
      inferLegacyDatePrecision: inferLegacyDatePrecision,
      generateEventId: generateEventId,
      createEventConfig: createEventConfig,
      migrateEventConfig: migrateEventConfig,
      resolveEventStatus: resolveEventStatus,
      refreshEventLifecycle: refreshEventLifecycle,
      startEvent: startEvent,
      validGuestPin: validGuestPin,
      deriveGuestPinVerifier: deriveGuestPinVerifier,
      enableGuestPin: enableGuestPin,
      disableGuestPin: disableGuestPin,
      verifyGuestPin: verifyGuestPin,
      createGuestPinThrottleState: createGuestPinThrottleState,
      guestPinThrottleStatus: guestPinThrottleStatus,
      recordGuestPinAttempt: recordGuestPinAttempt,
      createSparseSetupConfig: createSparseSetupConfig,
      encodeSetupPass: encodeSetupPass,
      decodeSetupPass: decodeSetupPass,
      buildSetupPassUrl: buildSetupPassUrl
    });
  }
));
