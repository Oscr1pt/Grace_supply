import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.CHG29_DISPOSABLE_TESTS === "1";
const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const container = process.env.LOCAL_SUPABASE_CONTAINER;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const credentials = {
  username: `chg29-admin-${suffix}`,
  email: `chg29-admin-${suffix}@example.test`,
  password: `Local-${crypto.randomUUID()}-9a!`,
};

let service;
let originalSettings;
let userId;

test.describe.serial("CHG-29 V1 ITBIS settings", () => {
  test.skip(!enabled, "CHG-29 browser tests require a disposable local stack.");

  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey || !container)
      throw new Error("Local Supabase variables are required.");
    if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(url))
      throw new Error("Non-loopback URL refused.");
    if (!/^supabase_db_chg29[a-z0-9]+$/.test(container))
      throw new Error("Non-disposable database refused.");
    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const settings = await service.from("settings").select("*").single();
    if (settings.error) throw settings.error;
    originalSettings = settings.data;
    const created = await service.auth.admin.createUser({
      email: credentials.email,
      password: credentials.password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    userId = created.data.user.id;
    const profile = await service.from("user_profiles").insert({
      auth_user_id: userId,
      username: credentials.username,
      name: "Synthetic CHG-29 administrator",
      role: "admin",
      permissions: ["dashboard", "settings", "sales"],
      active: true,
    });
    if (profile.error) throw profile.error;
  });

  test.afterAll(async () => {
    if (originalSettings) {
      await service
        .from("settings")
        .update({
          business_name: originalSettings.business_name,
          business_address: originalSettings.business_address,
          business_phone: originalSettings.business_phone,
          tax_rate: originalSettings.tax_rate,
          tax_calculation_enabled: originalSettings.tax_calculation_enabled,
        })
        .eq("id", originalSettings.id);
    }
    if (userId) await service.auth.admin.deleteUser(userId);
  });

  async function login(page) {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /Entrar al sistema/ })).toBeVisible({
      timeout: 15_000,
    });
    await page.locator("#username").fill(credentials.username);
    await page.locator("#password").fill(credentials.password);
    await expect(page.locator("#username")).toHaveValue(credentials.username);
    await expect(page.locator("#password")).toHaveValue(credentials.password);
    await page.getByRole("button", { name: /Entrar al sistema/ }).click();
    await expect(page.getByRole("button", { name: /Cerrar sesi/ })).toBeVisible({
      timeout: 15_000,
    });
  }

  test("solo muestra el interruptor fijo y persiste Guardar ajustes tras recargar", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/settings");
    await expect(page.getByRole("checkbox", { name: "Aplicar ITBIS" })).toBeVisible();
    await expect(page.getByLabel("Tasa de impuesto (%)")).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Aplicar ITBIS" }).check();
    await page.getByRole("button", { name: "Guardar ajustes" }).click();
    await expect(page.getByText("Cambios confirmados.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Aplicar ITBIS" })).toBeChecked();
  });

  test("el servidor conserva la tasa V1 fija al guardar la configuración", async () => {
    const actor = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const loginResult = await actor.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });
    if (loginResult.error) throw loginResult.error;
    const saved = await actor.rpc("save_sales_tax_v1", {
      p_request: {
        business_name: originalSettings.business_name,
        business_address: originalSettings.business_address,
        business_phone: originalSettings.business_phone,
        tax_rate: 18,
        tax_calculation_enabled: false,
      },
    });
    if (saved.error) throw saved.error;
    expect(Number(saved.data.tax_rate)).toBe(18);
    expect(saved.data.tax_calculation_enabled).toBe(false);
  });
});
