import { defineConfig } from "@playwright/test";

const port = Number(process.env.REPORTS_PREVIEW_PORT ?? 5194);

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "reports-visual.spec.mjs",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command: `npx vite --config vite.reports-preview.config.ts --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/tests/fixtures/reports-preview.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
