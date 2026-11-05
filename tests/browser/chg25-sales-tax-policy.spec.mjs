import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.CHG25_DISPOSABLE_TESTS === "1";
const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const container = process.env.LOCAL_SUPABASE_CONTAINER;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const admin = {
  username: `chg25-admin-${suffix}`,
  email: `chg25-admin-${suffix}@example.test`,
  password: `Tax-${crypto.randomUUID()}-9a!`,
};

let service;
let actor;
let adminId;
let clientId;
let gravadoId;
let exentoId;
let pendienteId;
let originalSettings;

test.describe.serial("CHG-25 configurable ITBIS and internal receipts", () => {
  test.skip(!enabled, "CHG-25 browser tests require a disposable local stack.");

  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey || !container) {
      throw new Error("CHG-25 requires explicit local Supabase variables.");
    }
    const host = new URL(url).hostname;
    if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
      throw new Error("CHG-25 refuses non-loopback Supabase URLs.");
    }
    if (!/^supabase_db_chg25[a-z0-9]+$/.test(container)) {
      throw new Error("CHG-25 refuses a non-disposable database container.");
    }
    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const settings = await service.from("settings").select("*").single();
    if (settings.error) throw settings.error;
    originalSettings = settings.data;
    const resetPolicy = await service
      .from("settings")
      .update({
        tax_rate: 18,
        tax_policy_approved: false,
        tax_calculation_enabled: false,
        tax_policy_status: "pending",
        tax_policy_version: null,
        tax_policy_approved_at: null,
        tax_policy_approved_by: null,
        tax_receipt_mode: "internal",
        tax_prices_include: false,
        tax_rounding_policy: "line_half_up",
      })
      .eq("id", settings.data.id);
    if (resetPolicy.error) throw resetPolicy.error;
    const created = await service.auth.admin.createUser({
      email: admin.email,
      password: admin.password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    adminId = created.data.user.id;
    const profile = await service.from("user_profiles").insert({
      auth_user_id: adminId,
      username: admin.username,
      name: "Synthetic CHG-25 administrator",
      role: "admin",
      permissions: ["dashboard", "clients", "inventory", "sales", "settings"],
      active: true,
    });
    if (profile.error) throw profile.error;
    actor = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await actor.auth.signInWithPassword({
      email: admin.email,
      password: admin.password,
    });
    if (login.error) throw login.error;
    const client = await service
      .from("clients")
      .insert({ name: `CHG25 cliente ${suffix}` })
      .select("id")
      .single();
    if (client.error) throw client.error;
    clientId = client.data.id;
    for (const [classification, name] of [
      ["gravado", "Gravado"],
      ["exento", "Exento"],
      ["pendiente", "Pendiente"],
    ]) {
      const item = await service
        .from("inventory")
        .insert({
          sku: `CHG25-${classification}-${suffix}`,
          kind: "product",
          name: `CHG25 ${name} ${suffix}`,
          category: "otro",
          cost_price: 10,
          price: 100,
          quantity: 0,
          is_active: true,
          tax_classification: classification,
        })
        .select("id")
        .single();
      if (item.error) throw item.error;
      if (classification === "gravado") gravadoId = item.data.id;
      if (classification === "exento") exentoId = item.data.id;
      if (classification === "pendiente") pendienteId = item.data.id;
    }
    for (const itemId of [gravadoId, exentoId, pendienteId]) {
      const adjustment = await actor.rpc("adjust_inventory", {
        p_request: {
          idempotency_key: crypto.randomUUID(),
          item_id: itemId,
          delta: 2,
          expected_quantity: 0,
          reason: "Synthetic CHG-25 browser fixture",
        },
      });
      if (adjustment.error) throw adjustment.error;
    }
  });

  async function login(page) {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /Entrar al sistema/ })).toBeVisible({
      timeout: 15_000,
    });
    const usernameInput = page.locator("#username");
    const passwordInput = page.locator("#password");
    await expect(usernameInput).toBeVisible();
    await usernameInput.fill(admin.username);
    await passwordInput.fill(admin.password);
    await expect(usernameInput).toHaveValue(admin.username);
    await expect(passwordInput).toHaveValue(admin.password);
    await page.getByRole("button", { name: /Entrar al sistema/ }).click();
    await expect(page.getByRole("button", { name: /Cerrar sesi/ })).toBeVisible({
      timeout: 15_000,
    });
  }

  test("bloquea ventas pendientes y permite revisar la configuración administrativa", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/sales");
    await expect(page.getByRole("alert").filter({ hasText: /Ventas bloqueadas/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Nueva venta/ })).toHaveCount(0);
    await page.goto("/settings");
    const taxToggle = page.getByRole("checkbox", { name: "Aplicar ITBIS" });
    await expect(taxToggle).toBeVisible();
    await expect(taxToggle).not.toBeChecked();
    await taxToggle.check();
    await page.getByRole("button", { name: "Guardar ajustes" }).click();
    await expect(page.getByText("Cambios confirmados.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Aplicar ITBIS" })).toBeChecked();
  });

  test("verifica modos ITBIS, clasificación pendiente, snapshots e idempotencia", async ({
    page,
  }) => {
    const approved = await actor.rpc("approve_sales_tax_policy", {
      p_request: {
        enabled: true,
        rate: 18,
        policy_version: `chg25-browser-${suffix}`,
        prices_include: false,
        receipt_mode: "internal",
        approve: true,
      },
    });
    if (approved.error) throw approved.error;
    const gravado = await actor.rpc("post_sale", {
      p_request: {
        idempotency_key: crypto.randomUUID(),
        client_id: clientId,
        payment_type: "contado",
        lines: [{ item_id: gravadoId, quantity: 1, expected_unit_price: 100 }],
      },
    });
    if (gravado.error) throw gravado.error;
    expect(Number(gravado.data.subtotal)).toBe(100);
    expect(Number(gravado.data.tax)).toBe(18);
    expect(Number(gravado.data.total)).toBe(118);
    const replay = await actor.rpc("post_sale", {
      p_request: {
        idempotency_key: gravado.data.operation_id,
        client_id: clientId,
        payment_type: "contado",
        lines: [{ item_id: gravadoId, quantity: 1, expected_unit_price: 100 }],
      },
    });
    expect(replay.error ?? null).toBeNull();
    const pending = await actor.rpc("post_sale", {
      p_request: {
        idempotency_key: crypto.randomUUID(),
        client_id: clientId,
        payment_type: "contado",
        lines: [{ item_id: pendienteId, quantity: 1, expected_unit_price: 100 }],
      },
    });
    expect(pending.error?.code).toBe("55000");
    const disabled = await actor.rpc("approve_sales_tax_policy", {
      p_request: {
        enabled: false,
        rate: 18,
        policy_version: `chg25-browser-disabled-${suffix}`,
        prices_include: false,
        receipt_mode: "internal",
        approve: true,
      },
    });
    if (disabled.error) throw disabled.error;
    const base = await actor.rpc("post_sale", {
      p_request: {
        idempotency_key: crypto.randomUUID(),
        client_id: clientId,
        payment_type: "contado",
        lines: [{ item_id: exentoId, quantity: 1, expected_unit_price: 100 }],
      },
    });
    if (base.error) throw base.error;
    expect(Number(base.data.tax)).toBe(0);
    expect(Number(base.data.total)).toBe(100);
    await login(page);
    await page.goto("/sales");
    await page
      .getByRole("button", { name: /Ver recibo/ })
      .first()
      .click();
    await expect(page.getByText(/RECIBO INTERNO/).first()).toBeVisible();
  });

  test.afterAll(async () => {
    if (!service) return;
    if (originalSettings) {
      await service
        .from("settings")
        .update({
          tax_rate: originalSettings.tax_rate,
          tax_policy_approved: originalSettings.tax_policy_approved,
          tax_calculation_enabled: originalSettings.tax_calculation_enabled,
          tax_policy_status: originalSettings.tax_policy_status,
          tax_policy_version: originalSettings.tax_policy_version,
          tax_receipt_mode: originalSettings.tax_receipt_mode,
          tax_prices_include: originalSettings.tax_prices_include,
          tax_rounding_policy: originalSettings.tax_rounding_policy,
        })
        .eq("id", originalSettings.id);
    }
    for (const id of [pendienteId, exentoId, gravadoId])
      if (id) await service.from("inventory").delete().eq("id", id);
    if (clientId) await service.from("clients").delete().eq("id", clientId);
    if (adminId) {
      await service.from("user_profiles").delete().eq("auth_user_id", adminId);
      await service.auth.admin.deleteUser(adminId);
    }
  });
});
