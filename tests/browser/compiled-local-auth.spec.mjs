import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const username = `build-auth-${suffix}`;
const email = `build-auth-${suffix}@example.test`;
const password = `BuildAuth-${crypto.randomUUID()}-a9!`;
let service;
let identityId;

test.describe("compiled frontend auth against isolated local Supabase", () => {
  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey)
      throw new Error("Isolated local Supabase keys are required.");
    if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname)) {
      throw new Error("Refusing to run compiled auth tests against a non-local Supabase target.");
    }
    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw new Error("Could not create the synthetic local auth identity.");
    identityId = created.data.user.id;
    const profile = await service.from("user_profiles").insert({
      auth_user_id: identityId,
      username,
      name: `Synthetic compiled auth ${suffix}`,
      role: "employee",
      permissions: ["dashboard", "purchases"],
      active: true,
    });
    if (profile.error) throw new Error("Could not create the synthetic local profile.");
  });

  test.afterAll(async () => {
    if (!service || !identityId) return;
    await service.from("user_profiles").delete().eq("auth_user_id", identityId);
    await service.auth.admin.deleteUser(identityId);
  });

  test("login, profile, dashboard, reload, protected route, logout, and relogin work in the compiled build", async ({
    page,
    context,
  }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/login");
    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel(/Contrase/).fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.reload();
    await expect(page.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toBeVisible();
    await page.getByRole("link", { name: "Compras" }).click();
    await expect(page).toHaveURL(/\/purchases$/);
    await expect(page.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toBeVisible();

    const unauthenticated = await context.newPage();
    await unauthenticated.goto("/dashboard");
    await expect(unauthenticated).toHaveURL(/\/login$/);
    await unauthenticated.close();

    await page.getByRole("button", { name: "Cerrar sesi\u00f3n" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel(/Contrase/).fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(pageErrors).toEqual([]);
  });
});
