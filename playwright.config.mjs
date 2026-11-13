import { defineConfig } from "@playwright/test";

const localApiUrl = process.env.LOCAL_SUPABASE_URL;
const browserPort = Number(process.env.PLAYWRIGHT_PORT ?? 5174);
if (!localApiUrl || !["127.0.0.1", "localhost"].includes(new URL(localApiUrl).hostname)) {
  throw new Error(
    "Browser tests require LOCAL_SUPABASE_URL on localhost; Cloud targets are refused.",
  );
}

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${browserPort}`,
    browserName: "chromium",
    launchOptions: { channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" },
    headless: true,
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${browserPort}`,
    url: `http://127.0.0.1:${browserPort}/login`,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: localApiUrl,
      VITE_SUPABASE_ANON_KEY: process.env.LOCAL_SUPABASE_ANON_KEY ?? "",
      VITE_ACCOUNT_PROVISIONING_ENABLED: "true",
      VITE_ACCOUNT_RECOVERY_ENABLED: process.env.VITE_ACCOUNT_RECOVERY_ENABLED ?? "true",
    },
    timeout: 60_000,
  },
});
