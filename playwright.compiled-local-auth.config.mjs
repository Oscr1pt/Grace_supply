import { defineConfig } from "@playwright/test";
import path from "node:path";

const wrangler = path.resolve("node_modules/wrangler/bin/wrangler.js");
const config = path.resolve(".output/server/wrangler.json");
const port = Number(process.env.PLAYWRIGHT_LOCAL_BUILD_PORT ?? 8794);

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "compiled-local-auth.spec.mjs",
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
    command: `"${process.execPath}" "${wrangler}" dev --local --config "${config}" --ip 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
