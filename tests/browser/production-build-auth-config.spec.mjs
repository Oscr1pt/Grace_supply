import { test, expect } from "@playwright/test";

const projectOrigin = "https://qazjfofpfcwopcefupjl.supabase.co";

test("compiled login sends the exact approved public key and no Supabase request escapes interception", async ({
  page,
}) => {
  const expectedKey = process.env.GRACE_EXPECTED_PUBLIC_KEY;
  expect(expectedKey, "trusted key must be injected in memory by the local runner").toBeTruthy();
  const observedAuthRequests = [];
  const escapedSupabaseHosts = [];
  const consoleErrors = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname.endsWith(".supabase.co") && url.origin !== projectOrigin) {
      escapedSupabaseHosts.push(url.hostname);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.endsWith(".supabase.co")) return route.continue();
    if (url.origin !== projectOrigin) {
      return route.fulfill({ status: 403, body: "Unexpected Supabase host intercepted." });
    }
    const request = route.request();
    const pathname = url.pathname;
    if (pathname.startsWith("/functions/v1/username-login")) {
      observedAuthRequests.push({
        pathname,
        method: request.method(),
        hasApprovedKey: request.headers().apikey === expectedKey,
      });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" },
        body: JSON.stringify({ synthetic: true }),
      });
    }
    if (request.method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "apikey, authorization, content-type, x-client-info",
        },
      });
    }
    return route.fulfill({
      status: 401,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" },
      body: JSON.stringify({ message: "Synthetic unauthenticated response" }),
    });
  });

  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Entrar al sistema" })).toBeEnabled();
  await page.getByLabel("Usuario").fill("synthetic-build-probe");
  await page.getByLabel(/Contrase/).fill("synthetic-only-password");
  await page.getByRole("button", { name: "Entrar al sistema" }).click();
  await expect.poll(() => observedAuthRequests.length).toBeGreaterThan(0);

  expect(observedAuthRequests.every((request) => request.hasApprovedKey)).toBe(true);
  expect(observedAuthRequests.every((request) => request.method === "POST")).toBe(true);
  expect(escapedSupabaseHosts).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
