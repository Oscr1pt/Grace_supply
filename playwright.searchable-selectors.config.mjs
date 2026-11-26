import { defineConfig } from "@playwright/test";

const port = 5218;

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "searchable-entity-selectors.spec.mjs",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    launchOptions: { channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" },
    headless: true,
  },
  webServer: {
    command: `node ./node_modules/vite/bin/vite.js --config tests/fixtures/searchable-select-vite.config.mjs --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/tests/fixtures/searchable-select-preview.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
