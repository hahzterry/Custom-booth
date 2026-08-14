"use strict";

const { expect, test } = require("@playwright/test");
const {
  canvasSignature,
  installRuntimeProbes,
  openPhotobooth,
  resetRendererProbe,
  runtimeProbeState,
  selectAdminRenderer,
  visibleAdminTab,
  waitForCanvasChange,
  waitForReview
} = require("./helpers/booth");
const {
  assertDomPreviewIsProminent,
  assertFocusWithin,
  assertNoHorizontalOverflow,
  assertPreviewIsProminent,
  assertSelected,
  assertTouchTargets
} = require("./helpers/layout");
const { previewPhotoPayloads } = require("./helpers/photos");
const {
  SETTINGS_KEY,
  readGalleryRecords,
  readLocalState,
  seedHostState
} = require("./helpers/storage");

const EVENT_TITLE = "Alex & Sam's Summer Party";
const THEME_IDS = ["pop", "after-dark", "editorial", "sunshine"];
const THEME_NAMES = ["Pop", "After Dark", "Editorial", "Sunshine"];
const LIVE_WINDOW_MS = 48 * 60 * 60 * 1000;

async function themeRegistry(page) {
  return page.evaluate(() => {
    const Event = window.MyBishBashEvent;
    if (!Event) throw new Error("Missing LUMEE BOOTH EventConfig API");
    return Object.fromEntries(Event.THEME_IDS.map((id) => {
      const theme = Event.resolveTheme(id);
      return [id, {
        id: theme.id,
        name: theme.name,
        tagline: theme.tagline,
        primary: theme.primary,
        secondary: theme.secondary,
        highlight: theme.highlight,
        background: theme.background,
        foreground: theme.foreground,
        button: theme.button,
        buttonInk: theme.buttonInk,
        border: theme.border,
        decoration: theme.decoration,
        typography: theme.typography,
        stripFrame: theme.stripFrame,
        stripFilter: theme.stripFilter,
        magazineTemplate: theme.magazineTemplate,
        primaryInk: Event.safeForeground(theme.primary),
        secondaryInk: Event.safeForeground(theme.secondary),
        highlightInk: Event.safeForeground(theme.highlight)
      }];
    }));
  });
}

function themeRadio(page, id) {
  return page.locator(`input[name="eventTheme"][value="${id}"]`);
}

function themeCard(page, id) {
  return page.locator(`.host-theme-grid label[data-theme="${id}"]`);
}

function relativeLuminance(hex) {
  const channels = String(hex).slice(1).match(/.{2}/g).map((part) => parseInt(part, 16) / 255);
  return channels.reduce((total, channel, index) => {
    const linear = channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    return total + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

async function eventHomeThemeProfile(page, selector = "#adminEventHomePreview") {
  return page.locator(selector).evaluate((element) => ({
    theme: element.dataset.theme,
    decoration: element.dataset.decoration,
    typography: element.dataset.typography,
    surface: element.style.getPropertyValue("--event-surface").trim(),
    primary: element.style.getPropertyValue("--event-accent").trim(),
    secondary: element.style.getPropertyValue("--event-secondary").trim(),
    highlight: element.style.getPropertyValue("--event-shape").trim(),
    foreground: element.style.getPropertyValue("--event-ink").trim(),
    button: element.style.getPropertyValue("--event-button").trim(),
    buttonInk: element.style.getPropertyValue("--event-button-ink").trim(),
    border: element.style.getPropertyValue("--event-border").trim()
  }));
}

function expectedEventHomeTheme(theme) {
  return {
    theme: theme.id,
    decoration: theme.decoration,
    typography: theme.typography,
    surface: theme.background,
    primary: theme.primary,
    secondary: theme.secondary,
    highlight: theme.highlight,
    foreground: theme.foreground,
    button: theme.button,
    buttonInk: theme.buttonInk,
    border: theme.border
  };
}

test.beforeEach(async ({ page }) => {
  await seedHostState(page);
  await openPhotobooth(page);
  await installRuntimeProbes(page);
});

test("host can customise, use own photos, test the real camera and start separately", async ({ page }, testInfo) => {
  const themes = await themeRegistry(page);
  expect(Object.keys(themes)).toEqual(THEME_IDS);
  const initial = await readLocalState(page);
  expect(initial.settings.schemaVersion).toBe(3);
  expect(initial.settings.themeId).toBe("pop");
  expect(initial.settings.themePrimary).toBe(themes.pop.primary);
  expect(initial.settings.themeSecondary).toBe(themes.pop.secondary);
  expect(initial.settings.themeHighlight).toBe(themes.pop.highlight);
  expect(initial.settings.themeBackground).toBe(themes.pop.background);
  expect(initial.settings.themeForeground).toBe(themes.pop.foreground);
  expect(initial.settings.paletteId).toBeUndefined();
  expect(initial.settings.look).toBeUndefined();
  expect(initial.settings.accent).toBeUndefined();
  expect(initial.settings.eventStatus).toBe("DRAFT");
  expect(initial.settings.activatedAt).toBe("");
  expect(initial.settings.endsAt).toBe("");
  expect(await readGalleryRecords(page)).toEqual([]);

  await page.locator("#openPersonalSetup").click();
  await expect(page.locator("#settings")).toHaveClass(/\bactive\b/);
  await assertNoHorizontalOverflow(page, "#settings");
  await assertFocusWithin(page, "#settings");
  await assertDomPreviewIsProminent(page, "#adminEventHomePreview");
  await expect(page.locator("#adminEventHomePreview")).toHaveClass(/\bwelcome-screen\b/);
  await expect(page.locator("#adminPreviewCanvas")).toBeHidden();
  await assertSelected(await visibleAdminTab(page, "event-home"));

  await resetRendererProbe(page);
  await selectAdminRenderer(page, "strip");
  await assertPreviewIsProminent(page, ".admin-preview-stage");
  const placeholderStrip = await canvasSignature(page);
  expect([placeholderStrip.width, placeholderStrip.height]).toEqual([600, 1800]);

  await page.locator("#adminPreviewPhotos").setInputFiles(previewPhotoPayloads());
  await expect(page.locator("#previewPhotoStatus")).toContainText(/3/);
  await expect(page.locator("#previewPhotoThumbs").locator("img, canvas")).toHaveCount(3);
  const uploadedStrip = await waitForCanvasChange(page, placeholderStrip);

  await page.locator("#setEventTitle").fill(EVENT_TITLE);
  const namedStrip = await waitForCanvasChange(page, uploadedStrip);
  await page.locator('[data-setup-step="1"]').click();

  const themeRadios = page.locator('input[name="eventTheme"]');
  const themeCards = page.locator(".host-theme-grid .theme-card");
  await expect(themeRadios).toHaveCount(4);
  await expect(themeCards).toHaveCount(4);
  expect(await themeRadios.evaluateAll((radios) => radios.map((radio) => radio.value))).toEqual(THEME_IDS);
  for (const name of THEME_NAMES) {
    await expect(page.getByRole("radio", { name: new RegExp(name, "i") })).toBeAttached();
  }
  await expect(themeRadio(page, "pop")).toBeChecked();

  /* Event Home is a real production-styled surface, not a canvas mock. Its
     draft copy and complete theme roles must update before anything is saved. */
  const eventHomeTab = await visibleAdminTab(page, "event-home");
  await eventHomeTab.click();
  await assertSelected(eventHomeTab);
  await expect(page.locator("#adminPreviewCanvas")).toBeHidden();
  await assertDomPreviewIsProminent(page, "#adminEventHomePreview");
  await expect(page.locator("#adminEventPreviewTitle")).toHaveText(EVENT_TITLE);
  await expect(page.locator("#adminEventPreviewMeta")).toContainText("2026");
  await expect.poll(() => eventHomeThemeProfile(page)).toEqual(expectedEventHomeTheme(themes.pop));

  for (const id of ["after-dark", "editorial", "sunshine", "pop"]) {
    await themeCard(page, id).click();
    await expect(themeRadio(page, id)).toBeChecked();
    await expect.poll(() => eventHomeThemeProfile(page)).toEqual(expectedEventHomeTheme(themes[id]));
    await expect(page.locator("#adminEventPreviewTitle")).toHaveText(EVENT_TITLE);
  }

  await selectAdminRenderer(page, "strip");
  await assertPreviewIsProminent(page, ".admin-preview-stage");
  expect((await canvasSignature(page)).hash).toBe(namedStrip.hash);

  /* Native radios provide checked semantics and arrow-key operation. Each
     choice must also drive the real Strip renderer immediately. */
  await themeRadio(page, "pop").focus();
  await themeRadio(page, "pop").press("ArrowRight");
  await expect(themeRadio(page, "after-dark")).toBeChecked();
  const afterDarkStrip = await waitForCanvasChange(page, namedStrip);

  await themeRadio(page, "after-dark").press("ArrowRight");
  await expect(themeRadio(page, "editorial")).toBeChecked();
  const editorialStrip = await waitForCanvasChange(page, afterDarkStrip);

  await themeRadio(page, "editorial").press("ArrowRight");
  await expect(themeRadio(page, "sunshine")).toBeChecked();
  const sunshineStrip = await waitForCanvasChange(page, editorialStrip);

  await themeRadio(page, "sunshine").press("ArrowRight");
  await expect(themeRadio(page, "pop")).toBeChecked();
  const popStrip = await waitForCanvasChange(page, sunshineStrip);

  await themeCard(page, "editorial").click();
  await expect(themeRadio(page, "editorial")).toBeChecked();
  const brandedStrip = await waitForCanvasChange(page, popStrip);

  expect(new Set([
    namedStrip.hash,
    afterDarkStrip.hash,
    editorialStrip.hash,
    sunshineStrip.hash
  ]).size).toBe(4);
  const afterDarkLuminances = [
    themes["after-dark"].primary,
    themes["after-dark"].secondary,
    themes["after-dark"].highlight,
    themes["after-dark"].background,
    themes["after-dark"].foreground,
    themes["after-dark"].button
  ].map(relativeLuminance);
  expect(Math.min(...afterDarkLuminances), "After Dark needs a genuinely dark role").toBeLessThanOrEqual(0.08);
  expect(Math.max(...afterDarkLuminances), "After Dark needs a genuinely white/light role").toBeGreaterThanOrEqual(0.9);
  expect([
    themes["after-dark"].primaryInk,
    themes["after-dark"].secondaryInk,
    themes["after-dark"].highlightInk
  ]).toContain("#ffffff");
  for (const id of ["pop", "after-dark", "sunshine"]) {
    const roleDifferences = ["primary", "secondary", "highlight"]
      .filter((role) => themes.editorial[role] !== themes[id][role]);
    expect(roleDifferences.length, `Editorial must materially differ from ${id}`).toBeGreaterThanOrEqual(2);
  }
  await expect(page.locator('input[name="eventTheme"]:checked')).toHaveCount(1);
  await expect(page.locator(".host-theme-grid .theme-selected:visible")).toHaveCount(1);
  await expect(themeCard(page, "editorial").locator(".theme-selected")).toBeVisible();
  await assertNoHorizontalOverflow(page, "#settings");

  const themeLayout = await page.locator(".host-theme-grid").evaluate((grid) => {
    const cards = [...grid.querySelectorAll(".theme-card")];
    const boxes = cards.map((card) => card.getBoundingClientRect());
    const treatments = cards.map((card) =>
      card.querySelector(".theme-mini-event").getBoundingClientRect()
    );
    const colourBars = cards.map((card) =>
      card.querySelector(".theme-colours").getBoundingClientRect()
    );
    const fontSize = (selector) => parseFloat(getComputedStyle(grid.closest("#settings").querySelector(selector)).fontSize);
    return {
      columns: getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      cardMinHeight: Math.min(...boxes.map((box) => box.height)),
      treatmentMinHeight: Math.min(...treatments.map((box) => box.height)),
      colourBarMinHeight: Math.min(...colourBars.map((box) => box.height)),
      cardNameSize: parseFloat(getComputedStyle(cards[0].querySelector("strong")).fontSize),
      descriptionSize: parseFloat(getComputedStyle(cards[0].querySelector(".theme-description")).fontSize),
      helperSize: fontSize("#eventThemeHelp"),
      fieldLabelSize: fontSize("#setupPanel1 .host-defaults label"),
      selectSize: fontSize("#setupPanel1 .host-defaults select")
    };
  });
  expect(themeLayout.cardMinHeight).toBeGreaterThanOrEqual(230);
  expect(themeLayout.treatmentMinHeight).toBeGreaterThanOrEqual(120);
  expect(themeLayout.colourBarMinHeight).toBeGreaterThanOrEqual(16);
  expect(themeLayout.cardNameSize).toBeGreaterThanOrEqual(18);
  expect(themeLayout.descriptionSize).toBeGreaterThanOrEqual(16);
  expect(themeLayout.helperSize).toBeGreaterThanOrEqual(16);
  expect(themeLayout.fieldLabelSize).toBeGreaterThanOrEqual(16);
  expect(themeLayout.selectSize).toBeGreaterThanOrEqual(16);
  expect(themeLayout.columns).toBe(testInfo.project.name === "ipad-portrait" ? 2 : 1);

  await assertTouchTargets(page, [
    '.host-theme-grid label[data-theme="pop"]',
    '.host-theme-grid label[data-theme="after-dark"]',
    '.host-theme-grid label[data-theme="editorial"]',
    '.host-theme-grid label[data-theme="sunshine"]'
  ]);
  await page.locator("#setGuestPinEnabled").check();
  await page.locator("#setGuestPin").fill("2468");

  const stripTab = await selectAdminRenderer(page, "strip");
  await assertSelected(stripTab);
  expect((await canvasSignature(page)).hash).toBe(brandedStrip.hash);
  await expect.poll(async () => (await runtimeProbeState(page)).rendererOptions.strip).toEqual({
    accent: themes.editorial.primary,
    frameStyle: themes.editorial.stripFrame,
    filterStyle: themes.editorial.stripFilter,
    brandingPrimary: themes.editorial.primary,
    brandingSecondary: themes.editorial.highlight
  });

  const magazineTab = await selectAdminRenderer(page, "magazine");
  await assertSelected(magazineTab);
  const magazinePreview = await canvasSignature(page);
  expect(magazinePreview.opaquePixels).toBeGreaterThan(0);
  expect(Math.max(magazinePreview.width, magazinePreview.height) /
    Math.min(magazinePreview.width, magazinePreview.height)).toBeCloseTo(1.4, 1);
  await expect.poll(async () => (await runtimeProbeState(page)).rendererOptions.magazine).toEqual({
    accent: themes.editorial.primary,
    accentInk: themes.editorial.primaryInk,
    template: themes.editorial.magazineTemplate,
    brandingPrimary: themes.editorial.primary,
    brandingSecondary: themes.editorial.highlight
  });

  /* Keep Magazine active while switching themes: this catches previews that
     update only the Strip tab or merely repaint host CSS. */
  await themeCard(page, "after-dark").click();
  const afterDarkMagazine = await waitForCanvasChange(page, magazinePreview);
  await expect.poll(async () => (await runtimeProbeState(page)).rendererOptions.magazine).toEqual({
    accent: themes["after-dark"].primary,
    accentInk: themes["after-dark"].primaryInk,
    template: themes["after-dark"].magazineTemplate,
    brandingPrimary: themes["after-dark"].primary,
    brandingSecondary: themes["after-dark"].highlight
  });
  await themeCard(page, "editorial").click();
  await waitForCanvasChange(page, afterDarkMagazine);
  await expect.poll(async () => (await runtimeProbeState(page)).rendererOptions.magazine).toEqual({
    accent: themes.editorial.primary,
    accentInk: themes.editorial.primaryInk,
    template: themes.editorial.magazineTemplate,
    brandingPrimary: themes.editorial.primary,
    brandingSecondary: themes.editorial.highlight
  });

  const polaroidTab = await selectAdminRenderer(page, "polaroid");
  await assertSelected(polaroidTab);
  const polaroidPreview = await canvasSignature(page);
  expect(polaroidPreview.opaquePixels).toBeGreaterThan(0);
  await expect.poll(async () => (await runtimeProbeState(page)).rendererOptions.polaroid).toEqual({
    backdrop: themes.editorial.background,
    brandingPrimary: themes.editorial.primary,
    brandingSecondary: themes.editorial.highlight
  });

  /* The moving canvas changes every frame, so its production compose inputs
     are the deterministic proof that an active Polaroid preview updates now. */
  await themeCard(page, "sunshine").click();
  await expect(themeRadio(page, "sunshine")).toBeChecked();
  await expect.poll(async () => (await runtimeProbeState(page)).rendererOptions.polaroid).toEqual({
    backdrop: themes.sunshine.background,
    brandingPrimary: themes.sunshine.primary,
    brandingSecondary: themes.sunshine.highlight
  });
  await themeCard(page, "editorial").click();
  await expect(themeRadio(page, "editorial")).toBeChecked();
  await expect.poll(async () => (await runtimeProbeState(page)).rendererOptions.polaroid).toEqual({
    backdrop: themes.editorial.background,
    brandingPrimary: themes.editorial.primary,
    brandingSecondary: themes.editorial.highlight
  });

  await expect.poll(async () => (await runtimeProbeState(page)).renderers.strip).toBeGreaterThan(0);
  await expect.poll(async () => (await runtimeProbeState(page)).renderers.magazine).toBeGreaterThan(0);
  await expect.poll(async () => (await runtimeProbeState(page)).renderers.polaroid).toBeGreaterThan(0);

  expect(await readGalleryRecords(page)).toEqual([]);
  const beforeCamera = await readLocalState(page);
  expect(beforeCamera.settings.eventStatus).toBe("DRAFT");
  expect(beforeCamera.settings.activatedAt).toBe("");
  expect(beforeCamera.settings.endsAt).toBe("");
  expect(beforeCamera.settingsRaw).not.toMatch(/(?:data:image|blob:)/i);
  expect(beforeCamera.accessRaw).toBe(initial.accessRaw);
  expect(beforeCamera.edition).toBe(initial.edition);

  await assertTouchTargets(page, [
    '#settings [data-preview="event-home"]',
    '#settings [data-preview="strip"]',
    '#settings [data-preview="magazine"]',
    '#settings [data-preview="polaroid"]',
    "#testCameraFromSettings",
    "#clearPreviewPhotos"
  ]);

  await page.locator('[data-setup-step="3"]').click();
  await assertSelected(page.locator('[data-setup-step="3"]'));
  await page.locator("#testCameraFromSettings").click();
  await expect(page.locator("#camera")).toHaveClass(/\bactive\b/);
  await expect.poll(() => page.locator("#video").evaluate((video) => video.videoWidth)).toBeGreaterThan(0);
  await assertNoHorizontalOverflow(page, "#camera");
  await waitForReview(page);
  await assertNoHorizontalOverflow(page, "#review");
  await assertFocusWithin(page, "#review");

  const reviewStrip = page.locator('#reviewModeNav [data-mode="strip"]');
  const reviewMagazine = page.locator('#reviewModeNav [data-mode="magazine"]');
  const reviewPolaroid = page.locator('#reviewModeNav [data-mode="polaroid"]');
  await assertSelected(reviewStrip);

  const cameraStrip = await canvasSignature(page, "#mainCanvas");
  expect(cameraStrip.hash).not.toBe(brandedStrip.hash);
  expect(await readGalleryRecords(page)).toEqual([]);

  await reviewMagazine.click();
  await assertSelected(reviewMagazine);
  const favourites = page.locator("#coverPhotoChoices button");
  await expect(favourites).toHaveCount(3);
  const beforeFavourite = await canvasSignature(page, "#mainCanvas");
  await favourites.nth(1).click();
  await expect(favourites.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#magazineStyleStep")).toBeVisible();
  const magazineOutput = await waitForCanvasChange(page, beforeFavourite, "#mainCanvas");
  expect(Math.max(magazineOutput.width, magazineOutput.height) /
    Math.min(magazineOutput.width, magazineOutput.height)).toBeCloseTo(1.4, 1);

  await reviewPolaroid.click();
  await assertSelected(reviewPolaroid);
  const polaroidOutput = await waitForCanvasChange(page, magazineOutput, "#mainCanvas");
  expect(polaroidOutput.opaquePixels).toBeGreaterThan(0);
  await expect(page.locator("#mainCanvas:visible, #polaroidVideo:visible")).toHaveCount(1);

  await assertTouchTargets(page, [
    '#reviewModeNav [data-mode="strip"]',
    '#reviewModeNav [data-mode="magazine"]',
    '#reviewModeNav [data-mode="polaroid"]',
    "#retakeBtn",
    "#exitTestPreview"
  ]);

  await page.locator("#retakeBtn").click();
  await expect(page.locator("#camera")).toHaveClass(/\bactive\b/);
  await waitForReview(page);
  expect((await runtimeProbeState(page)).cameraCalls).toBe(2);
  expect(await readGalleryRecords(page)).toEqual([]);

  await page.locator("#exitTestPreview").click();
  await expect(page.locator("#settings")).toHaveClass(/\bactive\b/);
  await assertFocusWithin(page, "#settings");
  await assertSelected(page.locator('[data-setup-step="3"]'));
  await expect(page.locator('[data-setup-panel="3"]')).toBeVisible();
  await expect(page.locator("#setEventTitle")).toHaveValue(EVENT_TITLE);
  await expect(themeRadio(page, "editorial")).toBeChecked();
  await expect(page.locator("#setGuestPinEnabled")).toBeChecked();
  await expect(page.locator("#setGuestPin")).toHaveValue("2468");
  await expect(page.locator("#previewPhotoThumbs").locator("img, canvas")).toHaveCount(3);
  await selectAdminRenderer(page, "strip");
  await expect.poll(async () => (await canvasSignature(page)).hash).toBe(brandedStrip.hash);

  const afterExit = await readLocalState(page);
  expect(afterExit.settings.eventStatus).toBe("DRAFT");
  expect(afterExit.settings.activatedAt).toBe("");
  expect(afterExit.settings.endsAt).toBe("");
  expect(afterExit.settingsRaw).not.toContain("2468");
  expect(afterExit.accessRaw).toBe(initial.accessRaw);
  expect(afterExit.edition).toBe(initial.edition);
  expect(await readGalleryRecords(page)).toEqual([]);

  await page.locator('[data-setup-step="4"]').click();
  await page.locator("#saveSettings").click();
  await expect.poll(async () => (await readLocalState(page)).settings.eventTitle).toBe(EVENT_TITLE);

  /* A real reload must restore the selected theme from EventConfig rather
     than reconstructing it from transient CSS or the former accent field. */
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#landing")).toHaveClass(/\bactive\b/);
  await installRuntimeProbes(page);
  await page.locator("#openPersonalSetup").click();
  await page.locator('[data-setup-step="1"]').click();
  await expect(page.locator("#setEventTitle")).toHaveValue(EVENT_TITLE);
  await expect(themeRadio(page, "editorial")).toBeChecked();
  await expect(page.locator(".host-theme-grid .theme-selected:visible")).toHaveCount(1);
  await assertNoHorizontalOverflow(page, "#settings");

  await page.locator('[data-setup-step="4"]').click();
  await page.locator("#launchCustomBooth").click();
  await expect(page.locator("#welcome")).toHaveClass(/\bactive\b/);
  await expect(page.locator("#previewEventBtn")).toBeVisible();
  await expect(page.locator("#activateEventBtn")).toBeVisible();
  await expect(page.locator("#welcome")).toHaveClass(/\bwelcome-screen\b/);
  await expect(page.locator("#welcomeTitle")).toHaveText(EVENT_TITLE);
  expect(await eventHomeThemeProfile(page, "#welcome")).toEqual(expectedEventHomeTheme(themes.editorial));
  /* Event Home deliberately clips its oversized decorative shapes; unlike
     the settings form, that non-interactive artwork may exceed the surface. */
  await assertNoHorizontalOverflow(page, "#welcome", { allowClippedDecorativeOverflow: true });
  await assertTouchTargets(page, ["#previewEventBtn", "#activateEventBtn"]);

  const savedDraft = await readLocalState(page);
  expect(savedDraft.settings.eventTitle).toBe(EVENT_TITLE);
  expect(savedDraft.settings.schemaVersion).toBe(3);
  expect(savedDraft.settings.themeId).toBe(themes.editorial.id);
  expect(savedDraft.settings.themePrimary).toBe(themes.editorial.primary);
  expect(savedDraft.settings.themeSecondary).toBe(themes.editorial.secondary);
  expect(savedDraft.settings.themeHighlight).toBe(themes.editorial.highlight);
  expect(savedDraft.settings.themeBackground).toBe(themes.editorial.background);
  expect(savedDraft.settings.themeForeground).toBe(themes.editorial.foreground);
  expect(savedDraft.settings.themeButton).toBe(themes.editorial.button);
  expect(savedDraft.settings.themeButtonInk).toBe(themes.editorial.buttonInk);
  expect(savedDraft.settings.themeDecoration).toBe(themes.editorial.decoration);
  expect(savedDraft.settings.themeTypography).toBe(themes.editorial.typography);
  expect(savedDraft.settings.paletteId).toBeUndefined();
  expect(savedDraft.settings.look).toBeUndefined();
  expect(savedDraft.settings.accent).toBeUndefined();
  expect(savedDraft.settings.eventStatus).toBe("DRAFT");
  expect(savedDraft.settingsRaw).not.toContain("2468");
  expect(savedDraft.settings.activatedAt).toBe("");
  expect(savedDraft.settings.endsAt).toBe("");

  await page.locator("#previewEventBtn").click();
  await expect(page.locator("#camera")).toHaveClass(/\bactive\b/);
  await waitForReview(page);
  await page.locator("#exitTestPreview").click();
  await expect(page.locator("#welcome")).toHaveClass(/\bactive\b/);
  await expect(page.locator("#welcome")).toHaveClass(/\bhost-mode\b/);
  const afterEventHomeTest = await readLocalState(page);
  expect(afterEventHomeTest.settings.eventStatus).toBe("DRAFT");
  expect(afterEventHomeTest.settings.activatedAt).toBe("");
  expect(afterEventHomeTest.settings.endsAt).toBe("");
  expect(afterEventHomeTest.accessRaw).toBe(initial.accessRaw);
  expect(afterEventHomeTest.edition).toBe(initial.edition);
  expect(await readGalleryRecords(page)).toEqual([]);

  await page.locator("#activateEventBtn").click();
  const awaitingConfirmation = await readLocalState(page);
  expect(awaitingConfirmation.settings.eventStatus).toBe("DRAFT");
  expect(awaitingConfirmation.settings.activatedAt).toBe("");
  expect(awaitingConfirmation.settings.endsAt).toBe("");
  await expect(page.locator("#activateEventBtn")).toContainText(/confirm/i);

  await page.locator("#activateEventBtn").click();
  const live = await readLocalState(page);
  expect(live.settings.eventStatus).toBe("LIVE");
  expect(live.settings.activatedAt).not.toBe("");
  expect(live.settings.endsAt).not.toBe("");
  expect(Date.parse(live.settings.endsAt) - Date.parse(live.settings.activatedAt)).toBe(LIVE_WINDOW_MS);
  expect(live.accessRaw).toBe(initial.accessRaw);
  expect(live.edition).toBe(initial.edition);
  expect(await readGalleryRecords(page)).toEqual([]);
});

test("legacy saved looks and former palette ids migrate to the matching theme", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-portrait", "One browser migration pass is sufficient.");
  const themes = await themeRegistry(page);

  await page.evaluate(({ settingsKey }) => {
    localStorage.setItem(settingsKey, JSON.stringify({
      eventId: "event_e2e_host_preview",
      eventType: "party",
      eventTitle: "Legacy Sky Party",
      look: "sky",
      accent: "#12ff12",
      eventStatus: "DRAFT",
      activatedAt: "",
      endsAt: ""
    }));
  }, { settingsKey: SETTINGS_KEY });
  await page.reload({ waitUntil: "domcontentloaded" });

  const migrated = await readLocalState(page);
  expect(migrated.settings.schemaVersion).toBe(3);
  expect(migrated.settings.themeId).toBe("sunshine");
  expect(migrated.settings.themePrimary).toBe(themes.sunshine.primary);
  expect(migrated.settings.themeSecondary).toBe(themes.sunshine.secondary);
  expect(migrated.settings.themeHighlight).toBe(themes.sunshine.highlight);
  expect(migrated.settings.themeBackground).toBe(themes.sunshine.background);
  expect(migrated.settings.paletteId).toBeUndefined();
  expect(migrated.settings.look).toBeUndefined();
  expect(migrated.settings.accent).toBeUndefined();

  await page.locator("#openPersonalSetup").click();
  await page.locator('[data-setup-step="1"]').click();
  await expect(themeRadio(page, "sunshine")).toBeChecked();
  await expect(page.locator(".host-theme-grid .theme-selected:visible")).toHaveCount(1);

  /* Schema-2 events saved by the previous four-palette release also migrate;
     this is distinct from the older flat `look` migration above. */
  await page.evaluate(({ settingsKey }) => {
    localStorage.setItem(settingsKey, JSON.stringify({
      schemaVersion: 2,
      eventId: "event_e2e_host_preview",
      eventType: "party",
      eventTitle: "Former Pink Party",
      paletteId: "pink-party",
      palettePrimary: "#b52167",
      paletteSecondary: "#ffdce8",
      paletteHighlight: "#eee6ff",
      eventStatus: "DRAFT",
      activatedAt: "",
      endsAt: ""
    }));
  }, { settingsKey: SETTINGS_KEY });
  await page.reload({ waitUntil: "domcontentloaded" });

  const formerPalette = await readLocalState(page);
  expect(formerPalette.settings.themeId).toBe("pop");
  expect(formerPalette.settings.themePrimary).toBe(themes.pop.primary);
  expect(formerPalette.settings.themeSecondary).toBe(themes.pop.secondary);
  expect(formerPalette.settings.themeHighlight).toBe(themes.pop.highlight);
  expect(formerPalette.settings.themeBackground).toBe(themes.pop.background);
  expect(formerPalette.settings.paletteId).toBeUndefined();
  await page.locator("#openPersonalSetup").click();
  await page.locator('[data-setup-step="1"]').click();
  await expect(themeRadio(page, "pop")).toBeChecked();
  await expect(page.locator(".host-theme-grid .theme-selected:visible")).toHaveCount(1);
});

test("reduced motion holds the host Moving Polaroid until Play Motion", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-portrait", "One deterministic reduced-motion pass is sufficient.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#openPersonalSetup").click();
  await page.locator("#adminPreviewPhotos").setInputFiles(previewPhotoPayloads());
  await selectAdminRenderer(page, "polaroid");

  const first = await canvasSignature(page);
  await page.waitForTimeout(300);
  const second = await canvasSignature(page);
  expect(second.hash).toBe(first.hash);

  const play = page.locator("#adminPreviewPlayMotion");
  await expect(play).toBeVisible();
  await assertTouchTargets(page, ["#adminPreviewPlayMotion"]);
  await play.click();
  await waitForCanvasChange(page, second);
});

test("landing offers the six post-demo paths in the promised order", async ({ page }, testInfo) => {
  const section = page.locator("#personalPaths");
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();
  await assertNoHorizontalOverflow(page, "#personalPaths");

  const cards = section.locator(".personal-entry-card");
  await expect(cards).toHaveCount(6);
  
  const content = await cards.evaluateAll((items) => items.map((card) => {
    const action = card.querySelector("button,a");
    const isDisabled = action.getAttribute("disabled") !== null;
    return {
      heading: card.querySelector("h3").textContent.trim(),
      price: card.querySelector(":scope > span").textContent.trim(),
      action: action.textContent.trim(),
      tag: action.tagName,
      href: action.getAttribute("href"),
      hasFreeHandlerHook: action.hasAttribute("data-start-photobooth"),
      id: action.id,
      disabled: isDisabled
    };
  }));
  
  expect(content).toEqual([
    {
      heading: "Use for Free",
      price: "FREE",
      action: "ENTER",
      tag: "BUTTON",
      href: null,
      hasFreeHandlerHook: true,
      id: "",
      disabled: false
    },
    {
      heading: "Customise Your Own",
      price: "ONE PARTY",
      action: "CUSTOMISE",
      tag: "BUTTON",
      href: null,
      hasFreeHandlerHook: false,
      id: "openPersonalSetupSecondary",
      disabled: false
    },
    {
      heading: "Go Annual",
      price: "ANNUAL",
      action: "BUY ANNUAL",
      tag: "BUTTON",
      href: null,
      hasFreeHandlerHook: false,
      id: "",
      disabled: false
    },
    {
      heading: "For Business",
      price: "BUSINESS",
      action: "TALK TO US",
      tag: "A",
      href: "#businessContact",
      hasFreeHandlerHook: false,
      id: "",
      disabled: false
    },
    {
      heading: "Founding Lifetime SOLD OUT",
      price: "FOUNDING LIFETIME",
      action: "SOLD OUT",
      tag: "BUTTON",
      href: null,
      hasFreeHandlerHook: false,
      id: "",
      disabled: true
    },
    {
      heading: "6 Month Plan RETIRED",
      price: "6 MONTH PLAN",
      action: "NO LONGER AVAILABLE",
      tag: "BUTTON",
      href: null,
      hasFreeHandlerHook: false,
      id: "",
      disabled: true
    }
  ]);

  const layout = await section.evaluate((root) => {
    const grid = root.querySelector(".personal-entry-grid");
    const cardBoxes = [...grid.children].map((card) => card.getBoundingClientRect());
    return {
      immediatelyAfterOutputs: root.previousElementSibling && root.previousElementSibling.classList.contains("output-demo-grid"),
      columns: new Set(cardBoxes.map((box) => Math.round(box.left))).size,
      minCardHeight: Math.min(...cardBoxes.map((box) => box.height)),
      minCardWidth: Math.min(...cardBoxes.map((box) => box.width))
    };
  });
  
  expect(layout.immediatelyAfterOutputs).toBe(true);
  // On desktop, it should have exactly 3 distinct columns (2 rows)
  expect(layout.columns).toBe(testInfo.project.name === "phone-portrait" ? 1 : (testInfo.project.name === "ipad-portrait" ? 2 : 3));
  expect(layout.minCardHeight).toBeGreaterThanOrEqual(300);
  expect(layout.minCardWidth).toBeGreaterThanOrEqual(testInfo.project.name === "phone-portrait" ? 280 : 210);
  
  await assertTouchTargets(page, [
    "#personalPaths [data-start-photobooth]",
    "#openPersonalSetupSecondary",
    '#personalPaths [data-checkout-plan="PERSONAL_12_MONTH"]',
    '#personalPaths a[href="#businessContact"]'
  ]);
});