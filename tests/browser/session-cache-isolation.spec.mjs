import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const username = `cache-${suffix}`;
const email = `cache-${suffix}@example.test`;
const password = `Cache-${crypto.randomUUID()}-9c!`;
const employeeName = `Synthetic cache isolation employee ${suffix}`;
const userB = {
  username: `cache-b-${suffix}`,
  email: `cache-b-${suffix}@example.test`,
  password: `Cache-B-${crypto.randomUUID()}-9c!`,
};
const adminUser = {
  username: `cache-admin-${suffix}`,
  email: `cache-admin-${suffix}@example.test`,
  password: `Cache-Admin-${crypto.randomUUID()}-9c!`,
};
const adminName = `Synthetic cache isolation administrator ${suffix}`;
const sentinel = `STALE-PRIVATE-CACHE-${suffix}`;
const clientFixtureName = `A-ONLY-CLIENT-${suffix}`;
let service;
let identityId;
let identityBId;
let adminIdentityId;
let clientFixtureId;

test.describe("private browser cache isolation", () => {
  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey) throw new Error("Local Supabase test environment is required");
    if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname)) {
      throw new Error("Refusing to use non-local Supabase for cache isolation tests");
    }
    service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    identityId = created.data.user.id;
    const profile = await service.from("user_profiles").insert({
      auth_user_id: identityId,
      username,
      name: employeeName,
      role: "employee",
      permissions: ["dashboard", "clients"],
      active: true,
    });
    if (profile.error) throw profile.error;
    const createdB = await service.auth.admin.createUser({ email: userB.email, password: userB.password, email_confirm: true });
    if (createdB.error) throw createdB.error;
    identityBId = createdB.data.user.id;
    const profileB = await service.from("user_profiles").insert({
      auth_user_id: identityBId,
      username: userB.username,
      name: `Synthetic second cache isolation employee ${suffix}`,
      role: "employee",
      permissions: ["dashboard", "sales"],
      active: true,
    });
    if (profileB.error) throw profileB.error;
    const createdAdmin = await service.auth.admin.createUser({ email: adminUser.email, password: adminUser.password, email_confirm: true });
    if (createdAdmin.error) throw createdAdmin.error;
    adminIdentityId = createdAdmin.data.user.id;
    const adminProfile = await service.from("user_profiles").insert({
      auth_user_id: adminIdentityId,
      username: adminUser.username,
      name: adminName,
      role: "admin",
      permissions: ["dashboard", "clients", "suppliers", "inventory", "sales", "purchases", "expenses", "settings"],
      active: true,
    });
    if (adminProfile.error) throw adminProfile.error;
    const clientFixture = await service.from("clients").insert({ name: clientFixtureName }).select("id").single();
    if (clientFixture.error) throw clientFixture.error;
    clientFixtureId = clientFixture.data.id;
  });

  test.afterAll(async () => {
    if (!service || !identityId) return;
    if (clientFixtureId) await service.from("clients").delete().eq("id", clientFixtureId);
    if (identityBId) await service.auth.admin.deleteUser(identityBId);
    if (adminIdentityId) await service.auth.admin.deleteUser(adminIdentityId);
    await service.auth.admin.deleteUser(identityId);
  });

  async function login(page, user, userPassword) {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Entrar al sistema" })).toBeEnabled();
    await page.getByLabel("Usuario").fill(user);
    await page.getByLabel("Contraseña").fill(userPassword);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  }

  test("never hydrates a stale private localStorage row into an authenticated view", async ({ page }) => {
    await login(page, username, password);
    await expect(page.getByRole("link", { name: "Clientes" })).toBeVisible();
    const initialRead = page.waitForResponse((response) =>
      response.url().includes("/rest/v1/clients") && response.request().method() === "GET",
    );
    await page.getByRole("link", { name: "Clientes" }).click();
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
    await initialRead;
    await page.getByRole("link", { name: "Panel" }).click();

    await page.evaluate((name) => {
      localStorage.setItem("lustre_clients", JSON.stringify([{
        id: "00000000-0000-4000-8000-000000000009",
        name,
        email: "private@example.test",
        phone: "",
        address: "",
        notes: "",
        createdAt: "2026-01-01T00:00:00Z",
      }]));
    }, sentinel);

    let finishRead;
    let resolveReadStarted;
    const readStarted = new Promise((resolve) => { resolveReadStarted = resolve; });
    const readGate = new Promise((resolve) => { finishRead = resolve; });
    await page.route("**/rest/v1/clients**", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      resolveReadStarted();
      await readGate;
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    await page.getByRole("link", { name: "Clientes" }).click();
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();

    try {
      await readStarted;
      await expect(page.getByText(sentinel, { exact: true })).toHaveCount(0);
    } finally {
      finishRead?.();
    }
    await page.evaluate(() => localStorage.removeItem("lustre_clients"));
    await expect.poll(() => page.evaluate(() => localStorage.getItem("lustre_clients"))).toBeNull();
  });

  test("a delayed response from user A cannot repopulate user B's view or cache", async ({ page }) => {
    let releaseAResponse;
    let resolveAResponseHeld;
    let resolveAResponseDelivered;
    const aResponseHeld = new Promise((resolve) => { resolveAResponseHeld = resolve; });
    const aResponseDelivered = new Promise((resolve) => { resolveAResponseDelivered = resolve; });
    const aResponseGate = new Promise((resolve) => { releaseAResponse = resolve; });
    let interceptedA = false;
    let aResponseInjected = false;
    let aResponseFulfilled = false;
    let aResponseAborted = false;

    await login(page, username, password);
    await expect(page.getByRole("link", { name: "Clientes" })).toBeVisible();
    const secondIdentity = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const secondSession = await secondIdentity.auth.signInWithPassword({ email: userB.email, password: userB.password });
    if (secondSession.error) throw secondSession.error;
    await page.route("**/rest/v1/clients**", async (route) => {
      if (!interceptedA && route.request().method() === "GET") {
        interceptedA = true;
        const response = await route.fetch();
        const rows = await response.json();
        aResponseInjected = true;
        resolveAResponseHeld();
        await aResponseGate;
        try {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([...rows, {
              id: "00000000-0000-4000-8000-000000000008",
              name: sentinel,
              email: "",
              phone: "",
              address: "",
              notes: "",
              created_at: "2026-01-01T00:00:00Z",
              status: "activo",
            }]),
          });
          aResponseFulfilled = true;
        } catch (error) {
          if (!route.request().failure()) throw error;
          aResponseAborted = true;
        } finally {
          resolveAResponseDelivered();
        }
        return;
      }
      await route.continue();
    });
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
    await aResponseHeld;
    const sessionSet = await page.evaluate(async (session) => {
      const { supabase } = await import("/src/lib/supabase.ts");
      const result = await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
      return result.error?.message ?? null;
    }, secondSession.data.session);
    expect(sessionSet).toBeNull();
    await expect(page.getByText(userB.username, { exact: true })).toBeVisible();
    await expect(page.getByText("Acceso restringido")).toBeVisible();

    releaseAResponse();
    try {
      await aResponseDelivered;
      expect(interceptedA).toBe(true);
      expect(aResponseInjected).toBe(true);
      await expect(page.getByText(sentinel, { exact: true })).toHaveCount(0);
      const privateCache = await page.evaluate(() => localStorage.getItem("lustre_clients"));
      expect(privateCache ?? "").not.toContain(sentinel);
      expect(aResponseFulfilled || aResponseAborted).toBe(true);
    } finally {
      releaseAResponse();
    }
  });

  test("user B sees no client data after A logs out and B logs in", async ({ page }) => {
    await login(page, username, password);
    await page.getByRole("link", { name: "Clientes" }).click();
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
    await expect(page.getByText(clientFixtureName, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page.getByRole("button", { name: "Entrar al sistema" })).toBeVisible();

    await login(page, userB.username, userB.password);
    await expect(page.getByRole("link", { name: "Clientes" })).toHaveCount(0);
    await page.goto("/clients");
    await expect(page.getByText("Acceso restringido")).toBeVisible();
    await expect(page.getByText(clientFixtureName, { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("lustre_")))).toEqual([]);

    const actorB = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await actorB.auth.signInWithPassword({ email: userB.email, password: userB.password });
    if (signedIn.error) throw signedIn.error;
    const denied = await actorB.from("clients").select("id").eq("id", clientFixtureId);
    expect(denied.error?.code === "42501" || (denied.error === null && denied.data.length === 0)).toBe(true);
  });

  test("a late profile validation failure cannot sign out user B after its session is verified", async ({ page }) => {
    await login(page, username, password);
    await page.getByRole("link", { name: "Clientes" }).click();
    await expect(page.getByText(clientFixtureName, { exact: true })).toBeVisible();
    const secondIdentity = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const secondSession = await secondIdentity.auth.signInWithPassword({ email: userB.email, password: userB.password });
    if (secondSession.error) throw secondSession.error;

    let releaseProfile;
    let resolveProfileHeld;
    let resolveProfileDelivered;
    const profileHeld = new Promise((resolve) => { resolveProfileHeld = resolve; });
    const profileDelivered = new Promise((resolve) => { resolveProfileDelivered = resolve; });
    const profileGate = new Promise((resolve) => { releaseProfile = resolve; });
    let heldFirstProfileRead = false;
    let heldProfileAuthFilter;
    let deliveredProfileStatus;
    await page.route("**/rest/v1/user_profiles**", async (route) => {
      if (!heldFirstProfileRead && route.request().method() === "GET") {
        heldFirstProfileRead = true;
        heldProfileAuthFilter = new URL(route.request().url()).searchParams.get("auth_user_id");
        await route.fetch();
        resolveProfileHeld();
        await profileGate;
        try {
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ code: "42501", message: "profile access denied" }),
          });
          deliveredProfileStatus = 403;
        } finally {
          resolveProfileDelivered();
        }
        return;
      }
      await route.continue();
    });

    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await profileHeld;
    const sessionSet = await page.evaluate(async (session) => {
      const { supabase } = await import("/src/lib/supabase.ts");
      const result = await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
      return result.error?.message ?? null;
    }, secondSession.data.session);
    expect(sessionSet).toBeNull();
    await expect(page.getByText(userB.username, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    expect(heldProfileAuthFilter).toBe(`eq.${identityId}`);

    releaseProfile();
    await profileDelivered;
    expect(deliveredProfileStatus).toBe(403);
    await expect(page.getByText(userB.username, { exact: true })).toBeVisible();
    await expect(page.getByText(username, { exact: true })).toHaveCount(0);
    await expect(page.getByText("Acceso restringido")).toBeVisible();
    const currentAuthUser = await page.evaluate(async () => {
      const { supabase } = await import("/src/lib/supabase.ts");
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    });
    expect(currentAuthUser).toBe(identityBId);
  });

  test("two tabs handle logout without exposing either tab's private data", async ({ page, context }) => {
    const secondTab = await context.newPage();
    await login(page, username, password);
    await login(secondTab, userB.username, userB.password);
    await page.getByRole("link", { name: "Clientes" }).click();
    await expect(page.getByText(clientFixtureName, { exact: true })).toBeVisible();
    await secondTab.goto("/clients");
    await expect(secondTab.getByText("Acceso restringido")).toBeVisible();

    const tabState = await Promise.all([
      page.evaluate(() => ({
        authSessionKeys: Object.keys(sessionStorage).filter((key) => key.includes("auth-token")),
        privateLocalKeys: Object.keys(localStorage).filter((key) => key.startsWith("lustre_")),
      })),
      secondTab.evaluate(() => ({
        authSessionKeys: Object.keys(sessionStorage).filter((key) => key.includes("auth-token")),
        privateLocalKeys: Object.keys(localStorage).filter((key) => key.startsWith("lustre_")),
      })),
    ]);
    expect(tabState[0].authSessionKeys.length).toBeGreaterThan(0);
    expect(tabState[1].authSessionKeys.length).toBeGreaterThan(0);
    expect(tabState[0].privateLocalKeys).toEqual([]);
    expect(tabState[1].privateLocalKeys).toEqual([]);

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page.getByRole("button", { name: "Entrar al sistema" })).toBeVisible();
    const secondTabLogin = secondTab.getByRole("button", { name: "Entrar al sistema" });
    const secondTabRestricted = secondTab.getByText("Acceso restringido");
    await expect(secondTabLogin.or(secondTabRestricted)).toBeVisible();
    if (await secondTabLogin.isVisible().catch(() => false)) {
      await expect(secondTab.getByText(clientFixtureName, { exact: true })).toHaveCount(0);
    } else {
      await expect(secondTab.getByText(clientFixtureName, { exact: true })).toHaveCount(0);
    }
  });

  test("permission changes from the admin UI invalidate the employee tab immediately", async ({ page, context }) => {
    const adminTab = await context.newPage();
    await login(page, username, password);
    await page.getByRole("link", { name: "Clientes" }).click();
    await expect(page.getByText(clientFixtureName, { exact: true })).toBeVisible();
    const employeeIdentity = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await employeeIdentity.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    await login(adminTab, adminUser.username, adminUser.password);
    await adminTab.getByRole("link", { name: "Empleados" }).click();
    const employeeCard = adminTab.locator("div.rounded-lg.border.bg-card").filter({ hasText: `@${username}` });
    await expect(employeeCard).toBeVisible();
    await employeeCard.getByText("Clientes", { exact: true }).click();
    await expect(adminTab.getByText("Permisos actualizados")).toBeVisible();
    await expect(page.getByRole("link", { name: "Clientes" })).toHaveCount(0);
    await expect(page.getByText("Acceso restringido")).toBeVisible();
    await expect(page.getByText(clientFixtureName, { exact: true })).toHaveCount(0);
    const denied = await employeeIdentity.from("clients").select("id").eq("id", clientFixtureId);
    expect(denied.error?.code === "42501" || (denied.error === null && denied.data.length === 0)).toBe(true);

    await employeeCard.getByText("Clientes", { exact: true }).click();
    await expect(adminTab.getByText("Permisos actualizados")).toBeVisible();
    await expect(page.getByRole("link", { name: "Clientes" })).toBeVisible();
    await expect(page.getByText(clientFixtureName, { exact: true })).toBeVisible();
  });

  test("revoking an employee clears its session and access in the other tab", async ({ page, context }) => {
    const adminTab = await context.newPage();
    await login(page, username, password);
    await page.getByRole("link", { name: "Clientes" }).click();
    await expect(page.getByText(clientFixtureName, { exact: true })).toBeVisible();
    const staleIdentity = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await staleIdentity.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    await login(adminTab, adminUser.username, adminUser.password);
    await adminTab.getByRole("link", { name: "Empleados" }).click();
    const employeeCard = adminTab.locator("div.rounded-lg.border.bg-card").filter({ hasText: `@${username}` });
    await expect(employeeCard).toBeVisible();
    await employeeCard.getByRole("button", { name: `Revocar acceso a ${employeeName}` }).click();
    await adminTab.getByRole("button", { name: "Revocar acceso", exact: true }).click();
    await expect(adminTab.getByText("Acceso revocado")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar al sistema" })).toBeVisible();
    await expect(page.getByText(clientFixtureName, { exact: true })).toHaveCount(0);

    const denied = await staleIdentity.from("clients").select("id").eq("id", clientFixtureId);
    expect(denied.error?.code === "42501" || (denied.error === null && denied.data.length === 0)).toBe(true);
  });
});
