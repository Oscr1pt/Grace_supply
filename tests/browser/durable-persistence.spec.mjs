import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const username = `browser-${suffix}`;
const email = `browser-${suffix}@example.test`;
const password = `Browser-${crypto.randomUUID()}-9c!`;
let identityId;
let service;
let orderedClientId;
let orderedOldName;
let orderedNewName;
let purchaseItemId;
let purchaseItemSku;
let purchaseItemName;
let testSettings;

test.describe("durable persistence in the browser", () => {
  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey) throw new Error("Local Supabase test environment is required");
    service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    identityId = created.data.user.id;
    const profile = await service.from("user_profiles").insert({
      auth_user_id: identityId,
      username,
      name: "Synthetic browser persistence test",
      role: "admin",
      permissions: ["dashboard", "clients", "suppliers", "inventory", "sales", "purchases", "expenses", "settings"],
      active: true,
    });
    if (profile.error) throw profile.error;
    orderedOldName = `CHG01 browser order-old ${suffix}`;
    orderedNewName = `CHG01 browser order-new ${suffix}`;
    const seed = await service.from("clients").insert({ name: orderedOldName }).select("id").single();
    if (seed.error) throw seed.error;
    orderedClientId = seed.data.id;
    purchaseItemSku = `CHG07-BROWSER-${suffix}`;
    purchaseItemName = `Synthetic purchase item ${suffix}`;
    const item = await service.from("inventory").insert({ sku: purchaseItemSku, kind: "joya", name: purchaseItemName,
      category: "otro", cost_price: 2, price: 15, quantity: 0 }).select("id").single();
    if (item.error) throw item.error;
    purchaseItemId = item.data.id;
    const settings = await service.from("settings").select("*").single();
    if (settings.error) throw settings.error;
    testSettings = settings.data;
    const syntheticPolicy = await service.from("settings").update({ tax_rate: 0, tax_policy_approved: true,
      tax_prices_include: false, tax_rounding_policy: "synthetic-browser-test-only" }).eq("id", settings.data.id);
    if (syntheticPolicy.error) throw syntheticPolicy.error;
  });

  test.afterAll(async () => {
    if (!service || !identityId) return;
    const operations = await service.from("business_operations").select("id").eq("actor_id", identityId);
    for (const operation of operations.data ?? []) {
      await service.from("payment_reversals").delete().eq("operation_id", operation.id);
      await service.from("financial_compensations").delete().eq("operation_id", operation.id);
      await service.from("financial_audit_events").delete().eq("operation_id", operation.id);
    }
    await service.from("business_operations").delete().eq("actor_id", identityId);
    await service.from("expenses").delete().like("concept", `CHG08 browser ${suffix}%`);
    if (purchaseItemId) {
      const lines = await service.from("sale_lines").select("sale_id").eq("item_id", purchaseItemId);
      const saleIds = [...new Set((lines.data ?? []).map((line) => line.sale_id))];
      for (const saleId of saleIds) {
        await service.from("sale_lines").delete().eq("sale_id", saleId);
        await service.from("sales").delete().eq("id", saleId);
      }
      const purchases = await service.from("purchases").select("id").eq("item_id", purchaseItemId);
      for (const purchase of purchases.data ?? []) await service.from("purchases").delete().eq("id", purchase.id);
      await service.from("inventory").delete().eq("id", purchaseItemId);
    }
    if (testSettings) await service.from("settings").update({ tax_rate: testSettings.tax_rate,
      tax_policy_approved: testSettings.tax_policy_approved, tax_prices_include: testSettings.tax_prices_include,
      tax_rounding_policy: testSettings.tax_rounding_policy }).eq("id", testSettings.id);
    await service.from("clients").delete().like("name", `CHG01 browser ${suffix}%`);
    await service.auth.admin.deleteUser(identityId);
  });

  async function loginToClients(page, { waitForCache = true } = {}) {
    await page.addInitScript(() => {
      window.__printCount = 0;
      window.print = () => { window.__printCount += 1; };
    });
    await page.goto("/login");
    const submit = page.getByRole("button", { name: "Entrar al sistema" });
    await expect(submit).toBeEnabled();
    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel("Contraseña").fill(password);
    await expect(page.locator("#username")).toHaveValue(username);
    await expect(page.locator("#password")).toHaveValue(password);
    await submit.click();
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible({ timeout: 10_000 });
    const firstClientRead = waitForCache
      ? page.waitForResponse((response) => response.url().includes("/rest/v1/clients") && response.request().method() === "GET")
      : null;
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
    if (firstClientRead) await firstClientRead;
    if (waitForCache) expect(await page.evaluate(() => localStorage.getItem("lustre_clients"))).toBeNull();
  }

  async function openClientForm(page, name) {
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder("Juan Pérez / Barbería El Estilo").fill(name);
    return dialog;
  }

  test("SQL rejection keeps the form and cache unchanged without success, print or retry", async ({ page }) => {
    let writes = 0;
    await page.route("**/rest/v1/clients**", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      writes += 1;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ code: "23502", message: "null value in column violates not-null constraint", details: null, hint: null }),
      });
    });
    await loginToClients(page);
    const cacheBefore = await page.evaluate(() => localStorage.getItem("lustre_clients"));
    const name = `CHG01 browser SQL ${suffix}`;
    const dialog = await openClientForm(page, name);
    await dialog.getByRole("button", { name: "Agregar cliente" }).click();

    await expect(page.getByText("El servicio rechazó los datos. Revísalos e intenta de nuevo.")).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder("Juan Pérez / Barbería El Estilo")).toHaveValue(name);
    await expect(page.getByText("Cliente agregado")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("lustre_clients"))).toBe(cacheBefore);
    expect(writes).toBe(1);
    expect(await page.evaluate(() => window.__printCount)).toBe(0);
  });

  test("the browser records an expense once, then preserves it while an administrator annuls it with a reason", async ({ page }) => {
    let posts = 0;
    await page.route("**/rest/v1/rpc/post_expense", async (route) => {
      if (route.request().method() === "POST") posts += 1;
      await route.continue();
    });
    await loginToClients(page);
    await page.goto("/expenses");
    await expect(page.getByRole("heading", { name: "Gastos" })).toBeVisible();
    await page.getByRole("button", { name: "Registrar gasto" }).first().click();
    const dialog = page.getByRole("dialog");
    const concept = `CHG08 browser ${suffix}`;
    await dialog.getByPlaceholder("Ej. Pago de electricidad / Alquiler").fill(concept);
    await dialog.locator('input[type="number"]').fill("12.50");
    await dialog.getByPlaceholder("EDENORTE / Propietario / Empleado").fill("Fixture local");
    await dialog.getByRole("button", { name: "Registrar gasto" }).last().click();
    await expect(page.getByText("Gasto registrado y persistido")).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(posts).toBe(1);
    const row = page.locator("tr").filter({ hasText: concept });
    await expect(row).toBeVisible();
    page.once("dialog", (browserDialog) => browserDialog.accept("Corrección sintética de navegador"));
    await row.getByRole("button", { name: "Anular gasto" }).click();
    await expect(page.getByText("Gasto anulado correctamente")).toBeVisible();
    await expect(row.getByText("Anulado")).toBeVisible();
    const original = await service.from("expenses").select("amount,status,void_reason").eq("concept", concept).single();
    expect(original.error).toBeNull();
    expect(original.data).toEqual({ amount: 12.5, status: "anulado", void_reason: "Corrección sintética de navegador" });
  });

  test("the browser exposes sale annulment to an administrator and keeps the original receipt", async ({ page }) => {
    const actor = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const session = await actor.auth.signInWithPassword({ email, password });
    if (session.error) throw session.error;
    const purchase = await actor.rpc("post_purchase", { p_request: {
      idempotency_key: crypto.randomUUID(), supplier_name: "Synthetic browser fixture", item_id: purchaseItemId,
      quantity: 1, unit_cost: "2.00", restock: true, payment_type: "contado",
    } });
    expect(purchase.error).toBeNull();
    const sale = await actor.rpc("post_sale", { p_request: {
      idempotency_key: crypto.randomUUID(), client_id: orderedClientId, payment_type: "contado",
      lines: [{ item_id: purchaseItemId, quantity: 1, expected_unit_price: "15.00" }],
    } });
    expect(sale.error).toBeNull();
    await loginToClients(page);
    await page.goto("/sales");
    const row = page.locator("tr").filter({ hasText: sale.data.receipt_no });
    await expect(row).toBeVisible();
    page.once("dialog", (browserDialog) => browserDialog.accept("Corrección sintética de recibo"));
    await row.getByRole("button", { name: "Anular venta" }).click();
    await expect(page.getByText("Venta anulada con compensación persistida")).toBeVisible();
    await expect(row.getByText("Anulada")).toBeVisible();
    const original = await service.from("sales").select("total,voided_at,void_reason").eq("id", sale.data.sale_id).single();
    expect(original.error).toBeNull();
    expect(original.data).toEqual({ total: 15, voided_at: expect.any(String), void_reason: "Corrección sintética de recibo" });
  });

  test("pre-send disconnect preserves input and does not retry or cache an unconfirmed client", async ({ page }) => {
    let writes = 0;
    await page.route("**/rest/v1/clients**", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      writes += 1;
      await route.abort("failed");
    });
    await loginToClients(page);
    const cacheBefore = await page.evaluate(() => localStorage.getItem("lustre_clients"));
    const name = `CHG01 browser disconnect ${suffix}`;
    const dialog = await openClientForm(page, name);
    await dialog.getByRole("button", { name: "Agregar cliente" }).click();

    await expect(page.getByText("No se pudo confirmar el resultado. Verifica el registro antes de repetir.")).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder("Juan Pérez / Barbería El Estilo")).toHaveValue(name);
    await expect(page.getByText("Cliente agregado")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("lustre_clients"))).toBe(cacheBefore);
    expect(writes).toBe(1);
    expect(await page.evaluate(() => window.__printCount)).toBe(0);
  });

  test("RLS denial stays an error and does not close, print or cache the attempted client", async ({ page }) => {
    let writes = 0;
    await page.route("**/rest/v1/clients**", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      writes += 1;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ code: "42501", message: "new row violates row-level security policy", details: null, hint: null }),
      });
    });
    await loginToClients(page);
    const cacheBefore = await page.evaluate(() => localStorage.getItem("lustre_clients"));
    const name = `CHG01 browser denied ${suffix}`;
    const dialog = await openClientForm(page, name);
    await dialog.getByRole("button", { name: "Agregar cliente" }).click();

    await expect(page.getByText("La operación no fue autorizada.")).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder("Juan Pérez / Barbería El Estilo")).toHaveValue(name);
    await expect(page.getByText("Cliente agregado")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("lustre_clients"))).toBe(cacheBefore);
    expect(writes).toBe(1);
    expect(await page.evaluate(() => window.__printCount)).toBe(0);
  });

  test("a lost post-send response succeeds only after authorized readback and never repeats the insert", async ({ page }) => {
    let writes = 0;
    let insertedId;
    await page.route("**/rest/v1/clients**", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      writes += 1;
      const committed = await route.fetch();
      if (!committed.ok()) throw new Error(`Authorized browser insert was denied (${committed.status()}): ${await committed.text()}`);
      const rows = await committed.json();
      insertedId = rows[0]?.id;
      await committed.dispose();
      await route.abort("timedout");
    });
    await loginToClients(page);
    const name = `CHG01 browser timeout ${suffix}`;
    const dialog = await openClientForm(page, name);
    await dialog.getByRole("button", { name: "Agregar cliente" }).click();

    await expect(page.getByText("Cliente agregado")).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(name)).toBeVisible();
    expect(writes).toBe(1);
    expect(await page.evaluate(() => window.__printCount)).toBe(0);
    expect(insertedId).toBeTruthy();
    const saved = await service.from("clients").select("id,name").eq("id", insertedId).single();
    expect(saved.error).toBeNull();
    expect(saved.data).toEqual({ id: insertedId, name });
    expect(await page.evaluate(() => localStorage.getItem("lustre_clients"))).toBeNull();
  });

  test("a committed write with a failed readback remains uncertain and keeps the form open", async ({ page }) => {
    let writes = 0;
    let readbacks = 0;
    let insertedId;
    await page.route("**/rest/v1/clients**", async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        writes += 1;
        const committed = await route.fetch();
        if (!committed.ok()) throw new Error(`Authorized browser insert was denied (${committed.status()}): ${await committed.text()}`);
        insertedId = (await committed.json())[0]?.id;
        await committed.dispose();
        await route.abort("timedout");
        return;
      }
      const requestedId = new URL(request.url()).searchParams.get("id");
      if (request.method() === "GET" && insertedId && requestedId === `eq.${insertedId}`) {
        readbacks += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        });
        return;
      }
      await route.continue();
    });
    await loginToClients(page);
    const cacheBefore = await page.evaluate(() => localStorage.getItem("lustre_clients"));
    const name = `CHG01 browser uncertain ${suffix}`;
    const dialog = await openClientForm(page, name);
    await dialog.getByRole("button", { name: "Agregar cliente" }).click();

    await expect.poll(() => writes).toBe(1);
    await expect.poll(() => readbacks).toBe(1);
    await expect(page.getByText("No se pudo confirmar el resultado. Verifica el registro antes de repetir.")).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder("Juan Pérez / Barbería El Estilo")).toHaveValue(name);
    await expect(page.getByText("Cliente agregado")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("lustre_clients"))).toBe(cacheBefore);
    expect(writes).toBe(1);
    expect(readbacks).toBe(1);
    expect(await page.evaluate(() => window.__printCount)).toBe(0);
    const persisted = await service.from("clients").select("id,name").eq("id", insertedId).single();
    expect(persisted.error).toBeNull();
    expect(persisted.data.name).toBe(name);
  });

  test("an older read completing after navigation cannot overwrite the confirmed cache", async ({ page }) => {
    let captureFirstRead = true;
    let releaseOldRead;
    let oldResponseReady;
    let oldResponseFinished;
    const responseReady = new Promise((resolve) => { oldResponseReady = resolve; });
    const responseFinished = new Promise((resolve) => { oldResponseFinished = resolve; });
    const waitToRelease = new Promise((resolve) => { releaseOldRead = resolve; });

    await page.route("**/rest/v1/clients**", async (route) => {
      if (captureFirstRead && route.request().method() === "GET") {
        captureFirstRead = false;
        const staleResponse = await route.fetch();
        const body = await staleResponse.body();
        oldResponseReady();
        await waitToRelease;
        await route.fulfill({ response: staleResponse, body });
        oldResponseFinished();
        return;
      }
      await route.continue();
    });

    await loginToClients(page, { waitForCache: false });
    await responseReady;
    await page.getByRole("link", { name: "Inventario" }).click();
    await expect(page.getByRole("heading", { name: "Inventario" })).toBeVisible();
    const changed = await service.from("clients").update({ name: orderedNewName }).eq("id", orderedClientId).select("id").single();
    expect(changed.error).toBeNull();
    await page.getByRole("link", { name: "Clientes" }).click();
    await expect(page.getByText(orderedNewName)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("lustre_clients"))).toBeNull();

    releaseOldRead();
    await responseFinished;
    await expect.poll(async () => {
      const visible = await page.getByText(orderedNewName).count();
      return visible;
    }).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem("lustre_clients"))).toBeNull();
    await expect(page.getByText("Cliente actualizado")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => window.__printCount)).toBe(0);
  });

  test("financial SQL rejection keeps purchase form and cache without false confirmation or resend", async ({ page }) => {
    let writes = 0;
    await page.route("**/rest/v1/rpc/post_purchase", async (route) => {
      writes += 1;
      await route.fulfill({ status: 400, contentType: "application/json",
        body: JSON.stringify({ code: "23514", message: "synthetic denied financial write", details: null, hint: null }) });
    });
    await loginToClients(page);
    await page.goto("/purchases");
    await expect(page.getByRole("heading", { name: "Compras" })).toBeVisible();
    const cacheBefore = await page.evaluate(() => localStorage.getItem("lustre_purchases"));
    await page.getByRole("button", { name: "Nueva compra" }).click();
    const dialog = page.getByRole("dialog");
    const invoice = `CHG07-BROWSER-DENY-${suffix}`;
    await dialog.getByPlaceholder("Distribuidora Grace & Barber S.A.").fill(`Synthetic supplier ${suffix}`);
    await dialog.getByRole("combobox").nth(2).click();
    await page.getByRole("option", { name: new RegExp(purchaseItemSku) }).click();
    const fields = dialog.getByRole("textbox");
    await fields.nth(1).fill(invoice);
    await fields.nth(2).fill(`Preserved form ${suffix}`);
    const amounts = dialog.locator('input[type="number"]');
    await amounts.nth(0).fill("2");
    await amounts.nth(1).fill("3.50");
    await dialog.getByRole("button", { name: "Confirmar compra" }).click();

    await expect(page.getByText("El servicio rechazó los datos. Revísalos e intenta de nuevo.")).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder("Distribuidora Grace & Barber S.A.")).toHaveValue(`Synthetic supplier ${suffix}`);
    await expect(dialog.getByRole("textbox").nth(1)).toHaveValue(invoice);
    await expect(dialog.getByRole("textbox").nth(2)).toHaveValue(`Preserved form ${suffix}`);
    await expect(page.getByText("Compra confirmada")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("lustre_purchases"))).toBe(cacheBefore);
    expect(writes).toBe(1);
    expect(await page.evaluate(() => window.__printCount)).toBe(0);
  });

  test("lost post-commit financial response reconciles the UUID once before closing the form", async ({ page }) => {
    let writes = 0;
    let committedResult;
    let committedKey;
    const invoice = `CHG07-BROWSER-RECON-${suffix}`;
    await page.route("**/rest/v1/rpc/post_purchase", async (route) => {
      writes += 1;
      committedKey = route.request().postDataJSON().p_request.idempotency_key;
      const committed = await route.fetch();
      if (!committed.ok()) throw new Error(`Synthetic purchase RPC was denied (${committed.status()}): ${await committed.text()}`);
      committedResult = (await committed.json());
      await committed.dispose();
      await route.abort("timedout");
    });
    await loginToClients(page);
    await page.goto("/purchases");
    await expect(page.getByRole("heading", { name: "Compras" })).toBeVisible();
    await page.getByRole("button", { name: "Nueva compra" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("Distribuidora Grace & Barber S.A.").fill(`Synthetic supplier ${suffix}`);
    await dialog.getByRole("combobox").nth(2).click();
    await page.getByRole("option", { name: new RegExp(purchaseItemSku) }).click();
    await dialog.getByRole("textbox").nth(1).fill(invoice);
    await dialog.getByRole("textbox").nth(2).fill(`Reconcile by UUID ${suffix}`);
    const amounts = dialog.locator('input[type="number"]');
    await amounts.nth(0).fill("2");
    await amounts.nth(1).fill("3.50");
    const stockBefore = await service.from("inventory").select("quantity").eq("id", purchaseItemId).single();
    expect(stockBefore.error).toBeNull();
    const submit = dialog.getByRole("button", { name: "Confirmar compra" });
    await submit.click();

    await expect(page.getByText("Compra confirmada")).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(writes).toBe(1);
    expect(committedResult?.purchase_id).toBeTruthy();
    const persisted = await service.from("purchases").select("id,invoice_no,total").eq("invoice_no", invoice).single();
    expect(persisted.error).toBeNull();
    expect(persisted.data.id).toBe(committedResult.purchase_id);
    expect(persisted.data.total).toBe(7);
    const stock = await service.from("inventory").select("quantity").eq("id", purchaseItemId).single();
    expect(stock.error).toBeNull();
    expect(stock.data.quantity).toBe(stockBefore.data.quantity + 2);
    const operations = await service.from("business_operations").select("id,result")
      .eq("actor_id", identityId).eq("operation_type", "purchase").eq("idempotency_key", committedKey);
    expect(operations.error).toBeNull();
    expect(operations.data).toHaveLength(1);
    expect(operations.data[0].result.purchase_id).toBe(committedResult.purchase_id);
    expect(await page.evaluate(() => window.__printCount)).toBe(0);
  });
});
