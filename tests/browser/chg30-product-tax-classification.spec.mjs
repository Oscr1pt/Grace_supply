import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.CHG30_DISPOSABLE_TESTS === "1";
const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const container = process.env.LOCAL_SUPABASE_CONTAINER;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const admin = {
  username: `chg30-admin-${suffix}`,
  email: `chg30-admin-${suffix}@example.test`,
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

test.describe.serial("CHG-30 product tax classification and sales", () => {
  test.skip(!enabled, "CHG-30 browser tests require a disposable local stack.");

  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey || !container) throw new Error("Local stack is required.");
    if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(url))
      throw new Error("Cloud URL refused.");
    if (!/^supabase_db_chg30[a-z0-9]+$/.test(container))
      throw new Error("Non-disposable DB refused.");
    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const settings = await service.from("settings").select("*").single();
    if (settings.error) throw settings.error;
    originalSettings = settings.data;
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
      name: "Synthetic CHG-30 administrator",
      role: "admin",
      permissions: ["dashboard", "inventory", "sales", "settings", "clients"],
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
      .insert({ name: `CHG30 cliente ${suffix}` })
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
          sku: `CHG30-${classification}-${suffix}`,
          kind: "product",
          name: `CHG30 ${name} ${suffix}`,
          category: "otro",
          cost_price: 10,
          price: 100,
          quantity: 0,
          is_active: true,
          tax_classification: "pendiente",
        })
        .select("id")
        .single();
      if (item.error) throw item.error;
      if (classification === "gravado") gravadoId = item.data.id;
      if (classification === "exento") exentoId = item.data.id;
      if (classification === "pendiente") pendienteId = item.data.id;
    }
    for (const id of [gravadoId, exentoId, pendienteId]) {
      const adjustment = await actor.rpc("adjust_inventory", {
        p_request: {
          idempotency_key: crypto.randomUUID(),
          item_id: id,
          delta: 5,
          expected_quantity: 0,
          reason: "Synthetic CHG-30 browser fixture",
        },
      });
      if (adjustment.error) throw adjustment.error;
    }
  });

  async function login(page) {
    await page.goto("/login");
    const submit = page.getByRole("button", { name: "Entrar al sistema" });
    await expect(submit).toBeEnabled({ timeout: 15_000 });
    await page.locator("#username").fill(admin.username);
    await page.locator("#password").fill(admin.password);
    await submit.click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  }

  async function classify(page, sku, value) {
    await page.goto("/inventory");
    const row = page.locator("tr").filter({ hasText: sku });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /Editar/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").last().selectOption(value);
    await dialog.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Producto actualizado")).toBeVisible();
  }

  test("clasifica gravado y exento desde Inventario y conserva la selección", async ({ page }) => {
    await login(page);
    await classify(page, `CHG30-gravado-${suffix}`, "gravado");
    await classify(page, `CHG30-exento-${suffix}`, "exento");
    await page.reload();
    await expect(page.locator("tr").filter({ hasText: `CHG30-gravado-${suffix}` })).toBeVisible();
    const persisted = await service
      .from("inventory")
      .select("tax_classification")
      .in("id", [gravadoId, exentoId]);
    expect(persisted.error).toBeNull();
    expect(persisted.data.map((row) => row.tax_classification).sort()).toEqual([
      "exento",
      "gravado",
    ]);
  });

  test("confirma importes gravados/exentos, bloquea pendientes y conserva recibos", async ({
    page,
  }) => {
    const approved = await actor.rpc("approve_sales_tax_policy", {
      p_request: {
        enabled: true,
        rate: 18,
        policy_version: `chg30-browser-${suffix}`,
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
    expect(Number(gravado.data.tax)).toBe(18);
    expect(Number(gravado.data.total)).toBe(118);
    const exento = await actor.rpc("post_sale", {
      p_request: {
        idempotency_key: crypto.randomUUID(),
        client_id: clientId,
        payment_type: "contado",
        lines: [{ item_id: exentoId, quantity: 1, expected_unit_price: 100 }],
      },
    });
    if (exento.error) throw exento.error;
    expect(Number(exento.data.tax)).toBe(0);
    expect(Number(exento.data.total)).toBe(100);
    const mixed = await actor.rpc("post_sale", {
      p_request: {
        idempotency_key: crypto.randomUUID(),
        client_id: clientId,
        payment_type: "contado",
        lines: [
          { item_id: gravadoId, quantity: 1, expected_unit_price: 100 },
          { item_id: exentoId, quantity: 1, expected_unit_price: 100 },
        ],
      },
    });
    if (mixed.error) throw mixed.error;
    expect(Number(mixed.data.subtotal)).toBe(200);
    expect(Number(mixed.data.tax)).toBe(18);
    expect(Number(mixed.data.total)).toBe(218);
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
        policy_version: `chg30-browser-disabled-${suffix}`,
        prices_include: false,
        receipt_mode: "internal",
        approve: true,
      },
    });
    if (disabled.error) throw disabled.error;
    const noTax = await actor.rpc("post_sale", {
      p_request: {
        idempotency_key: crypto.randomUUID(),
        client_id: clientId,
        payment_type: "contado",
        lines: [{ item_id: gravadoId, quantity: 1, expected_unit_price: 100 }],
      },
    });
    if (noTax.error) throw noTax.error;
    expect(Number(noTax.data.tax)).toBe(0);
    expect(Number(noTax.data.total)).toBe(100);
    await login(page);
    await page.goto("/sales");
    await expect(page.getByRole("button", { name: /Nueva venta/ })).toBeVisible();
    await page
      .getByRole("button", { name: /Ver recibo/ })
      .first()
      .click();
    await expect(page.getByText(/RECIBO INTERNO/).first()).toBeVisible();
  });

  test.afterAll(async () => {
    if (!service) return;
    if (originalSettings)
      await service
        .from("settings")
        .update({
          business_name: originalSettings.business_name,
          business_address: originalSettings.business_address,
          business_phone: originalSettings.business_phone,
          tax_rate: originalSettings.tax_rate,
          tax_calculation_enabled: originalSettings.tax_calculation_enabled,
          tax_policy_approved: originalSettings.tax_policy_approved,
          tax_policy_status: originalSettings.tax_policy_status,
          tax_policy_version: originalSettings.tax_policy_version,
          tax_policy_approved_at: originalSettings.tax_policy_approved_at,
          tax_policy_approved_by: originalSettings.tax_policy_approved_by,
          tax_receipt_mode: originalSettings.tax_receipt_mode,
          tax_prices_include: originalSettings.tax_prices_include,
          tax_rounding_policy: originalSettings.tax_rounding_policy,
        })
        .eq("id", originalSettings.id);
    for (const id of [pendienteId, exentoId, gravadoId])
      if (id) await service.from("inventory").delete().eq("id", id);
    if (clientId) await service.from("clients").delete().eq("id", clientId);
    if (adminId) await service.auth.admin.deleteUser(adminId);
  });
});
