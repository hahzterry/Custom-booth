"use strict";

const { expect } = require("@playwright/test");

async function assertNoHorizontalOverflow(page, surfaceSelector, options = {}) {
  const result = await page.evaluate((selector) => {
    const root = document.documentElement;
    const surface = document.querySelector(selector);
    if (!surface) throw new Error("Missing surface " + selector);
    return {
      documentOverflow: root.scrollWidth - root.clientWidth,
      surfaceOverflow: surface.scrollWidth - surface.clientWidth,
      surfaceOverflowX: getComputedStyle(surface).overflowX
    };
  }, surfaceSelector);

  expect(result.documentOverflow, "document must not overflow horizontally").toBeLessThanOrEqual(1);
  if (options.allowClippedDecorativeOverflow) {
    expect(
      ["hidden", "clip"],
      surfaceSelector + " may only use its explicit decorative-overflow exception when clipping it"
    ).toContain(result.surfaceOverflowX);
    return;
  }
  expect(
    result.surfaceOverflow,
    surfaceSelector + " must fit its own surface without hidden horizontal overflow"
  ).toBeLessThanOrEqual(1);
}

async function assertTouchTargets(page, selectors) {
  for (const selector of selectors) {
    const candidates = page.locator(selector);
    const count = await candidates.count();
    let checked = 0;
    for (let index = 0; index < count; index += 1) {
      const candidate = candidates.nth(index);
      if (!(await candidate.isVisible())) continue;
      const box = await candidate.boundingBox();
      expect(box, selector + " must have a measurable touch target").not.toBeNull();
      expect(box.width, selector + " must be at least 44px wide").toBeGreaterThanOrEqual(44);
      expect(box.height, selector + " must be at least 44px high").toBeGreaterThanOrEqual(44);
      checked += 1;
    }
    expect(checked, selector + " must expose a visible touch target").toBeGreaterThan(0);
  }
}

async function assertFocusWithin(page, surfaceSelector) {
  const focus = await page.evaluate((selector) => {
    const surface = document.querySelector(selector);
    const active = document.activeElement;
    return {
      present: !!active,
      inside: !!surface && !!active && surface.contains(active),
      hidden: !active || active.hidden || active.getAttribute("aria-hidden") === "true"
    };
  }, surfaceSelector);
  expect(focus.present, "a focus target should exist").toBe(true);
  expect(focus.inside, "focus should move into " + surfaceSelector).toBe(true);
  expect(focus.hidden, "the focus target must remain perceivable").toBe(false);
}

async function assertSelected(locator) {
  await expect(locator).toBeVisible();
  const state = await locator.evaluate((element) =>
    element.getAttribute("aria-selected") ||
    element.getAttribute("aria-pressed") ||
    element.getAttribute("aria-current") || ""
  );
  expect(state, "selection must be exposed semantically").toBe("true");
}

async function assertPreviewIsProminent(page, selector, canvasSelector = "#adminPreviewCanvas") {
  await expect(page.locator(canvasSelector)).toBeVisible();
  const metrics = await page.locator(selector).evaluate((element, childSelector) => {
    const box = element.getBoundingClientRect();
    const canvas = element.querySelector(childSelector);
    if (!canvas) throw new Error("Missing preview canvas " + childSelector);
    const canvasBox = canvas.getBoundingClientRect();
    const intersectionWidth = Math.max(0, Math.min(box.right, canvasBox.right) - Math.max(box.left, canvasBox.left));
    const intersectionHeight = Math.max(0, Math.min(box.bottom, canvasBox.bottom) - Math.max(box.top, canvasBox.top));
    const canvasArea = canvasBox.width * canvasBox.height;
    return {
      width: box.width,
      height: box.height,
      canvasWidth: canvasBox.width,
      canvasHeight: canvasBox.height,
      canvasAreaRatio: canvasArea / Math.max(1, box.width * box.height),
      canvasVisibleRatio: intersectionWidth * intersectionHeight / Math.max(1, canvasArea),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  }, canvasSelector);
  expect(metrics.width).toBeGreaterThanOrEqual(Math.min(220, metrics.viewportWidth * 0.55));
  expect(metrics.height).toBeGreaterThanOrEqual(Math.min(300, metrics.viewportHeight * 0.35));
  expect(metrics.canvasWidth, "the rendered output itself must be materially wide").toBeGreaterThanOrEqual(80);
  expect(metrics.canvasHeight, "the rendered output itself must be materially tall").toBeGreaterThanOrEqual(
    Math.min(230, metrics.viewportHeight * 0.27)
  );
  expect(metrics.canvasAreaRatio, "the real renderer canvas must occupy a meaningful part of the preview stage")
    .toBeGreaterThanOrEqual(0.16);
  expect(metrics.canvasVisibleRatio, "the real renderer canvas must be visible inside the preview stage")
    .toBeGreaterThanOrEqual(0.95);
}

async function assertDomPreviewIsProminent(page, selector) {
  const preview = page.locator(selector);
  await expect(preview).toBeVisible();
  await preview.scrollIntoViewIfNeeded();
  const metrics = await preview.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const visibleWidth = Math.max(0, Math.min(window.innerWidth, box.right) - Math.max(0, box.left));
    const visibleHeight = Math.max(0, Math.min(window.innerHeight, box.bottom) - Math.max(0, box.top));
    return {
      width: box.width,
      height: box.height,
      visibleRatio: visibleWidth * visibleHeight / Math.max(1, box.width * box.height),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  });
  expect(metrics.width).toBeGreaterThanOrEqual(Math.min(220, metrics.viewportWidth * 0.55));
  expect(metrics.height).toBeGreaterThanOrEqual(Math.min(280, metrics.viewportHeight * 0.32));
  expect(metrics.visibleRatio, "the Event Home preview must be materially visible without clipping")
    .toBeGreaterThanOrEqual(0.9);
}

module.exports = {
  assertDomPreviewIsProminent,
  assertFocusWithin,
  assertNoHorizontalOverflow,
  assertPreviewIsProminent,
  assertSelected,
  assertTouchTargets
};
