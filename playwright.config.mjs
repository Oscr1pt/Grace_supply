import { defineConfig } from "@playwright/test";

const localApiUrl = process.env.LOCAL_SUPABASE_URL;
if (!localApiUrl || !["127.0.0.1", "localhost"].includes(new URL(localApiUrl).hostname)) {
  throw new Error("Browser tests require LOCAL_SUPABASE_URL on localhost; Cloud targets are refused.");
}

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5174",
    browserName: "chromium",
    launchOptions: { channel: "chrome" },
    headless: true,
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5174",
    url: "http://127.0.0.1:5174/login",
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: localApiUrl,
      VITE_SUPABASE_ANON_KEY: process.env.LOCAL_SUPABASE_ANON_KEY ?? "",
    },
    timeout: 60_000,
  },
});
