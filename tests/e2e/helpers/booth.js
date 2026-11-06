"use strict";

const { expect } = require("@playwright/test");

async function openPhotobooth(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const entrance = page.locator("#siteEntrance");
  if (await entrance.isVisible()) {
    await page.locator("#siteEntranceStart").click();
    await expect(entrance).toBeHidden();
  }
  await expect(page.locator("#landing")).toHaveClass(/\bactive\b/);
}

async function installRuntimeProbes(page) {
  await page.evaluate(() => {
    window.__e2eRendererCalls = { strip: 0, magazine: 0, polaroid: 0 };
    window.__e2eRendererOptions = { strip: null, magazine: null, polaroid: null };
    window.__e2eCameraCalls = 0;

    const wrap = (owner, key, counter) => {
      if (!owner || typeof owner[key] !== "function" || owner[key].__e2eWrapped) return;
      const original = owner[key];
      const replacement = function (...args) {
        window.__e2eRendererCalls[counter] += 1;
        const options = counter === "polaroid" ? args[0] : args[1];
        const branding = options && (options.branding || options.attribution);
        if (counter === "polaroid") {
          window.__e2eRendererOptions.polaroid = {
            backdrop: options && options.backdrop,
            brandingPrimary: branding && branding.primaryColor,
            brandingSecondary: branding && branding.secondaryColor
          };
        } else {
          const renderOptions = {
            accent: options && options.accent,
            accentInk: options && options.accentInk,
            brandingPrimary: branding && branding.primaryColor,
            brandingSecondary: branding && branding.secondaryColor
          };
          if (counter === "strip") {
            renderOptions.frameStyle = options && options.frameStyle;
            renderOptions.filterStyle = options && options.filterStyle;
          }
          if (counter === "magazine") renderOptions.template = options && options.template;
          window.__e2eRendererOptions[counter] = renderOptions;
        }
        return original.apply(this, args);
      };
      replacement.__e2eWrapped = true;
      owner[key] = replacement;
    };

    wrap(window.Strip, "render", "strip");
    wrap(window.Covers, "render", "magazine");
    wrap(window.Polaroid, "compose", "polaroid");

    const media = navigator.mediaDevices;
    if (media && typeof media.getUserMedia === "function" && !media.getUserMedia.__e2eWrapped) {
      const original = media.getUserMedia.bind(media);
      const replacement = (...args) => {
        window.__e2eCameraCalls += 1;
        return original(...args);
      };
      replacement.__e2eWrapped = true;
      media.getUserMedia = replacement;
    }
  });
}

async function resetRendererProbe(page) {
  await page.evaluate(() => {
    window.__e2eRendererCalls = { strip: 0, magazine: 0, polaroid: 0 };
    window.__e2eRendererOptions = { strip: null, magazine: null, polaroid: null };
  });
}

async function runtimeProbeState(page) {
  return page.evaluate(() => ({
    renderers: { ...window.__e2eRendererCalls },
    rendererOptions: JSON.parse(JSON.stringify(window.__e2eRendererOptions)),
    cameraCalls: window.__e2eCameraCalls
  }));
}

async function canvasSignature(page, selector = "#adminPreviewCanvas") {
  return page.locator(selector).evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement) || !canvas.width || !canvas.height) {
      return { width: 0, height: 0, hash: "0", opaquePixels: 0 };
    }
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    let opaquePixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      hash ^= pixels[index];
      hash = Math.imul(hash, 16777619);
      hash ^= pixels[index + 1];
      hash = Math.imul(hash, 16777619);
      hash ^= pixels[index + 2];
      hash = Math.imul(hash, 16777619);
      if (pixels[index + 3]) opaquePixels += 1;
    }
    return {
      width: canvas.width,
      height: canvas.height,
      hash: (hash >>> 0).toString(16),
      opaquePixels
    };
  });
}

async function waitForCanvasChange(page, previous, selector = "#adminPreviewCanvas") {
  await expect.poll(async () => (await canvasSignature(page, selector)).hash).not.toBe(previous.hash);
  const next = await canvasSignature(page, selector);
  expect(next.opaquePixels).toBeGreaterThan(0);
  return next;
}

async function visibleAdminTab(page, renderer) {
  const tabs = page.locator(`#settings [data-preview="${renderer}"]`);
  const count = await tabs.count();
  for (let index = 0; index < count; index += 1) {
    const tab = tabs.nth(index);
    if (await tab.isVisible()) return tab;
  }
  throw new Error("No visible admin preview tab for " + renderer);
}

async function selectAdminRenderer(page, renderer) {
  const tab = await visibleAdminTab(page, renderer);
  await tab.click();
  await expect(page.locator("#adminPreviewCanvas")).toHaveAttribute("data-renderer", renderer);
  return tab;
}

async function waitForReview(page) {
  await expect(page.locator("#review")).toHaveClass(/\bactive\b/, { timeout: 30_000 });
  await expect(page.locator("#hostTestBar")).toBeVisible();
  await expect(page.locator("#mainCanvas")).toBeVisible();
  await expect.poll(async () => (await canvasSignature(page, "#mainCanvas")).opaquePixels).toBeGreaterThan(0);
}

module.exports = {
  canvasSignature,
  installRuntimeProbes,
  openPhotobooth,
  resetRendererProbe,
  runtimeProbeState,
  selectAdminRenderer,
  visibleAdminTab,
  waitForCanvasChange,
  waitForReview
};
