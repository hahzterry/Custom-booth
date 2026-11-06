"use strict";

const { defineConfig } = require("@playwright/test");

const CAMERA_ARGS = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream"
];

module.exports = defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/playwright",
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    permissions: ["camera"],
    serviceWorkers: "block",
    launchOptions: { args: CAMERA_ARGS },
    actionTimeout: 12_000,
    navigationTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1",
    url: "http://127.0.0.1:4173/index.html",
    reuseExistingServer: false,
    timeout: 15_000,
    stdout: "ignore",
    stderr: "pipe"
  },
  projects: [
    {
      name: "phone-portrait",
      use: {
        viewport: { width: 390, height: 844 },
        screen: { width: 390, height: 844 },
        hasTouch: true
      }
    },
    {
      name: "ipad-portrait",
      use: {
        viewport: { width: 820, height: 1180 },
        screen: { width: 820, height: 1180 },
        hasTouch: true
      }
    },
    {
      name: "ipad-landscape",
      use: {
        viewport: { width: 1180, height: 820 },
        screen: { width: 1180, height: 820 },
        hasTouch: true
      }
    }
  ]
});
