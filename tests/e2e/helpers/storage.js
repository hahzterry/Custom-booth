"use strict";

const SETTINGS_KEY = "mybishbashPhotoboothSettingsV1";
const ACCESS_KEY = "mybishbashPhotoboothVerifiedAccessV1";
const EDITION_KEY = "mybishbashPhotoboothEditionSequenceV1";
const GALLERY_DB = "mybishbashPhotoboothGallery";

const SEEDED_EVENT_ID = "event_e2e_host_preview";

function seededAccess() {
  return {
    plan: "ONE_EVENT",
    entitlement: "ONE_EVENT",
    eventId: SEEDED_EVENT_ID,
    accessToken: "e2e-one-event-access",
    accessTokenExpiresAt: "2099-12-31T23:59:59.000Z",
    entitlements: ["ONE_EVENT"],
    serverVerified: true,
    verifiedAt: "2026-08-11T12:00:00.000Z"
  };
}

function seededSettings() {
  return {
    /* Deliberately seed the previous schema so every browser journey proves
       that an existing saved event is migrated in place before the host edits
       it. Reloads must then keep the newly saved schema-2 palette. */
    schemaVersion: 1,
    eventId: SEEDED_EVENT_ID,
    eventType: "party",
    eventTitle: "Your Celebration",
    location: "",
    eventLine: "",
    date: "2026",
    datePrecision: "unknown",
    look: "lilac",
    eventStatus: "DRAFT",
    activatedAt: "",
    endsAt: "",
    accent: "#ff5b52",
    countdown: 0,
    mirror: false,
    prompts: false,
    shutter: false,
    flash: false,
    confetti: false
  };
}

async function seedHostState(page) {
  const state = {
    settingsKey: SETTINGS_KEY,
    accessKey: ACCESS_KEY,
    editionKey: EDITION_KEY,
    settings: seededSettings(),
    access: seededAccess(),
    edition: "37"
  };

  await page.addInitScript((seed) => {
    sessionStorage.setItem("mybishbashPhotoboothEntranceSeenV1", "1");
    if (!localStorage.getItem(seed.settingsKey)) {
      localStorage.setItem(seed.settingsKey, JSON.stringify(seed.settings));
    }
    if (!localStorage.getItem(seed.accessKey)) {
      localStorage.setItem(seed.accessKey, JSON.stringify(seed.access));
    }
    if (!localStorage.getItem(seed.editionKey)) {
      localStorage.setItem(seed.editionKey, seed.edition);
    }
  }, state);

  return state;
}

async function readLocalState(page) {
  return page.evaluate(({ settingsKey, accessKey, editionKey }) => {
    const rawSettings = localStorage.getItem(settingsKey);
    return {
      settings: rawSettings ? JSON.parse(rawSettings) : null,
      settingsRaw: rawSettings,
      accessRaw: localStorage.getItem(accessKey),
      edition: localStorage.getItem(editionKey)
    };
  }, { settingsKey: SETTINGS_KEY, accessKey: ACCESS_KEY, editionKey: EDITION_KEY });
}

async function readGalleryRecords(page) {
  return page.evaluate(async (databaseName) => {
    if (typeof indexedDB.databases !== "function") {
      throw new Error("This Chromium test requires indexedDB.databases().");
    }
    const databases = await indexedDB.databases();
    if (!databases.some((database) => database.name === databaseName)) return [];

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("sessions")) {
          database.close();
          resolve([]);
          return;
        }
        const transaction = database.transaction("sessions", "readonly");
        const all = transaction.objectStore("sessions").getAll();
        all.onerror = () => reject(all.error);
        all.onsuccess = () => {
          const records = (all.result || []).map((record) => ({
            id: record.id,
            experience: record.experience,
            photoCount: Array.isArray(record.photos) ? record.photos.length : 0
          }));
          database.close();
          resolve(records);
        };
      };
    });
  }, GALLERY_DB);
}

module.exports = {
  ACCESS_KEY,
  EDITION_KEY,
  GALLERY_DB,
  SEEDED_EVENT_ID,
  SETTINGS_KEY,
  readGalleryRecords,
  readLocalState,
  seedHostState,
  seededAccess,
  seededSettings
};
