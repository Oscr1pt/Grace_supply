import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const admin = {
  username: `chg20-admin-${suffix}`,
  email: `chg20-admin-${suffix}@example.test`,
  password: `Settings-${crypto.randomUUID()}-9c!`,
};
const employee = {
  username: `chg20-employee-${suffix}`,
  email: `chg20-employee-${suffix}@example.test`,
  password: `Settings-${crypto.randomUUID()}-9c!`,
};
let service;
let adminId;
let employeeId;
let productId;
let clientId;
let settingsBefore;
let policyBefore;
const productSku = `CHG20-${suffix}`;
const clientName = `CHG20 remote cache fixture ${suffix}`;

test.describe.serial("CHG-20 settings and barcode safety", () => {
  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey)
      throw new Error("Disposable local Supabase is required for CHG-20 browser tests");
    if (!new URL(url).hostname.match(/^(localhost|127\.0\.0\.1|\[::1\])$/)) {
      throw new Error("CHG-20 browser tests refuse non-local Supabase URLs");
    }
    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const settings = await service.from("settings").select("*").single();
    if (settings.error) throw settings.error;
    settingsBefore = settings.data;
    policyBefore = settings.data.tax_policy_approved;
    if (policyBefore !== false) throw new Error("The disposable tax policy must start unapproved");

    const adminUser = await service.auth.admin.createUser({
      email: admin.email,
      password: admin.password,
      email_confirm: true,
    });
    if (adminUser.error) throw adminUser.error;
    adminId = adminUser.data.user.id;
    const adminProfile = await service.from("user_profiles").insert({
      auth_user_id: adminId,
      username: admin.username,
      name: "Synthetic CHG-20 settings administrator",
      role: "admin",
      permissions: [
        "dashboard",
        "clients",
        "suppliers",
        "inventory",
        "sales",
        "purchases",
        "expenses",
        "settings",
      ],
      active: true,
    });
    if (adminProfile.error) throw adminProfile.error;

    const employeeUser = await service.auth.admin.createUser({
      email: employee.email,
      password: employee.password,
      email_confirm: true,
    });
    if (employeeUser.error) throw employeeUser.error;
    employeeId = employeeUser.data.user.id;
    const employeeProfile = await service.from("user_profiles").insert({
      auth_user_id: employeeId,
      username: employee.username,
      name: "Synthetic CHG-20 settings employee",
      role: "employee",
      permissions: ["dashboard", "inventory"],
      active: true,
    });
    if (employeeProfile.error) throw employeeProfile.error;

    const product = await service
      .from("inventory")
      .insert({
        kind: "product",
        sku: productSku,
        name: `CHG-20 label item ${suffix}`,
        category: "otro",
        cost_price: 4.25,
        price: 12.34,
        quantity: 0,
      })
      .select("id")
      .single();
    if (product.error) throw product.error;
    productId = product.data.id;

    const client = await service.from("clients").insert({ name: clientName }).select("id").single();
    if (client.error) throw client.error;
    clientId = client.data.id;
  });

  test.afterAll(async () => {
    if (!service) return;
    if (settingsBefore) {
      await service
        .from("settings")
        .update({
          business_name: settingsBefore.business_name,
          business_address: settingsBefore.business_address,
          business_phone: settingsBefore.business_phone,
          tax_rate: settingsBefore.tax_rate,
          currency: settingsBefore.currency,
          label_width_mm: settingsBefore.label_width_mm,
          label_height_mm: settingsBefore.label_height_mm,
          label_bar_width: settingsBefore.label_bar_width,
          label_bar_height: settingsBefore.label_bar_height,
          label_show_price: settingsBefore.label_show_price,
        })
        .eq("id", settingsBefore.id);
    }
    if (productId) await service.from("inventory").delete().eq("id", productId);
    if (clientId) await service.from("clients").delete().eq("id", clientId);
    if (employeeId) await service.auth.admin.deleteUser(employeeId);
    if (adminId) await service.auth.admin.deleteUser(adminId);
  });

  async function login(page, user = admin) {
    await page.addInitScript(() => {
      window.__printCount = 0;
      window.print = () => {
        window.__printCount += 1;
      };
    });
    await page.goto("/login");
    const submit = page.getByRole("button", { name: "Entrar al sistema" });
    await expect(submit).toBeEnabled();
    await page.locator("#username").fill(user.username);
    await page.locator("#password").fill(user.password);
    await expect(page.locator("#username")).toHaveValue(user.username);
    await expect(page.locator("#password")).toHaveValue(user.password);
    await submit.click();
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  }

  async function actorFor(page) {
    const accessToken = await page.evaluate(() => {
      for (let index = 0; index < sessionStorage.length; index += 1) {
        const key = sessionStorage.key(index);
        try {
          const value = JSON.parse(sessionStorage.getItem(key));
          if (value?.access_token) return value.access_token;
        } catch {
          /* Ignore non-authentication entries. */
        }
      }
      return null;
    });
    if (!accessToken) throw new Error("Expected an authenticated browser session");
    return createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }

  test("validates business fields, confirms saves, and leaves tax policy approval unchanged", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/settings");
    await expect(page.getByText("Cambios confirmados.")).toBeVisible();

    let writes = 0;
    await page.route("**/rest/v1/settings**", async (route) => {
      if (route.request().method() === "PATCH") writes += 1;
      await route.continue();
    });

    await page.getByLabel("Nombre del negocio").fill(" ");
    await page.getByLabel("Teléfono de contacto").fill("abc");
    await page.getByLabel("Tasa de impuesto (%)").fill("");
    await page.getByRole("button", { name: "Guardar ajustes" }).click();
    await expect(page.getByText("Escribe el nombre del negocio.")).toBeVisible();
    await expect(
      page.getByText("Escribe un teléfono válido con entre 7 y 15 dígitos."),
    ).toBeVisible();
    await expect(page.getByText("Escribe una tasa numérica entre 0 y 100.")).toBeVisible();
    await expect(page.getByLabel("Nombre del negocio")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Nombre del negocio")).toHaveAttribute(
      "aria-describedby",
      "settings-businessName-error",
    );
    expect(writes).toBe(0);

    const businessName = `CHG-20 Grace ${suffix}`;
    await page.getByLabel("Nombre del negocio").fill(businessName);
    await page.getByLabel("Dirección").fill(`Dirección de prueba ${suffix}`);
    await page.getByLabel("Teléfono de contacto").fill("+1 (809) 555-0123");
    await page.getByLabel("Tasa de impuesto (%)").fill("19.25");
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes("/rest/v1/settings") && response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "Guardar ajustes" }).click();
    expect((await saved).ok()).toBe(true);
    await expect(page.getByText("Ajustes del negocio guardados")).toBeVisible();

    const persisted = await service
      .from("settings")
      .select("business_name,business_address,business_phone,tax_rate,tax_policy_approved")
      .single();
    expect(persisted.error).toBeNull();
    expect(persisted.data).toEqual({
      business_name: businessName,
      business_address: `Dirección de prueba ${suffix}`,
      business_phone: "+1 (809) 555-0123",
      tax_rate: 19.25,
      tax_policy_approved: policyBefore,
    });

    const actor = await actorFor(page);
    const saleCountBefore = await service
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);
    const blockedSale = await actor.rpc("post_sale", {
      p_request: {
        idempotency_key: crypto.randomUUID(),
        client_id: clientId,
        payment_type: "contado",
        lines: [{ item_id: productId, quantity: 1, expected_unit_price: "12.34" }],
      },
    });
    expect(blockedSale.error?.code).toBe("55000");
    expect(blockedSale.error?.message).toContain("financial_tax_policy_pending");
    const saleCountAfter = await service
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);
    expect(saleCountAfter.count).toBe(saleCountBefore.count);
  });

  test("keeps business edits after a failed write and retries without false success", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/settings");
    await expect(page.getByText("Cambios confirmados.")).toBeVisible();
    const draftName = `CHG-20 retry ${suffix}`;
    await page.getByLabel("Nombre del negocio").fill(draftName);
    await page.route("**/rest/v1/settings**", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "synthetic failure" }),
      });
    });
    await page.getByRole("button", { name: "Guardar ajustes" }).click();
    await expect(
      page.getByText("No se guardaron los cambios. Puedes corregirlos o volver a intentarlo."),
    ).toBeVisible();
    await expect(page.getByLabel("Nombre del negocio")).toHaveValue(draftName);
    await expect(page.getByText("Ajustes del negocio guardados")).toHaveCount(0);

    await page.unrouteAll();
    await page.getByRole("button", { name: "Guardar ajustes" }).click();
    await expect(page.getByText("Ajustes del negocio guardados")).toBeVisible();
    const saved = await service.from("settings").select("business_name").single();
    expect(saved.data.business_name).toBe(draftName);
  });

  test("requires confirmation to reset and leaves values untouched when canceled", async ({
    page,
  }) => {
    await login(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/settings");
    await expect(page.getByText("Cambios confirmados.")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const before = await service
      .from("settings")
      .select(
        "business_name,tax_rate,label_width_mm,label_height_mm,label_show_price,tax_policy_approved",
      )
      .single();

    const resetButton = page.getByRole("button", { name: "Restablecer valores" });
    await resetButton.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Se guardarán en la base de datos");
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await resetButton.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    const canceled = await service
      .from("settings")
      .select(
        "business_name,tax_rate,label_width_mm,label_height_mm,label_show_price,tax_policy_approved",
      )
      .single();
    expect(canceled.data).toEqual(before.data);

    await page.getByRole("button", { name: "Restablecer valores" }).click();
    const confirm = page.waitForResponse(
      (response) =>
        response.url().includes("/rest/v1/settings") && response.request().method() === "PATCH",
    );
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Guardar valores predeterminados" })
      .click();
    expect((await confirm).ok()).toBe(true);
    await expect(page.getByText("Ajustes predeterminados guardados")).toBeVisible();
    const reset = await service
      .from("settings")
      .select(
        "business_name,tax_rate,label_width_mm,label_height_mm,label_show_price,tax_policy_approved",
      )
      .single();
    expect(reset.data).toEqual({
      business_name: "GRACE SUPPLY",
      tax_rate: 18,
      label_width_mm: 50,
      label_height_mm: 30,
      label_show_price: true,
      tax_policy_approved: policyBefore,
    });
  });

  test("keeps label settings synchronized from both routes and prints only confirmed dimensions and price", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/settings");
    await expect(page.getByText("Ajustes confirmados.")).toBeVisible();
    await page.locator("#label-width-mm").fill("65");
    await expect(page.getByText("Ajuste de etiqueta confirmado.")).toBeVisible();
    await page.locator("#label-height-mm").fill("35");
    await expect(page.getByText("Ajuste de etiqueta confirmado.")).toBeVisible();

    await page.goto("/inventory");
    const row = page.locator("tr").filter({ hasText: productSku });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Código de barras" }).click();
    const dialog = page.getByRole("dialog");
    const label = dialog.locator("#barcode-print");
    expect(await label.evaluate((element) => element.style.width)).toBe("65mm");
    expect(await label.evaluate((element) => element.style.height)).toBe("35mm");
    await expect(label).toContainText(
      new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(12.34),
    );

    let releaseWrite;
    let markPending;
    const pending = new Promise((resolve) => {
      markPending = resolve;
    });
    const gate = new Promise((resolve) => {
      releaseWrite = resolve;
    });
    await page.route("**/rest/v1/settings**", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      markPending();
      await gate;
      await route.continue();
    });
    await dialog.locator("#label-width-mm").fill("80");
    await pending;
    await expect(dialog.getByRole("button", { name: "Imprimir" })).toBeDisabled();
    await expect(label).toHaveAttribute("style", /width: 65mm/);
    releaseWrite();
    await expect(dialog.getByText("Ajuste de etiqueta confirmado.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Imprimir" })).toBeEnabled();
    await expect(label).toHaveAttribute("style", /width: 80mm/);
    const pageRule = await page
      .locator("style")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.textContent).find((text) => text?.includes("@page")),
      );
    expect(pageRule).toContain("size: 80mm 35mm");
    await dialog.getByRole("button", { name: "Imprimir" }).click();
    expect(await page.evaluate(() => window.__printCount)).toBe(1);

    const persisted = await service
      .from("settings")
      .select("label_width_mm,label_height_mm,label_show_price")
      .single();
    expect(persisted.data).toEqual({
      label_width_mm: 80,
      label_height_mm: 35,
      label_show_price: true,
    });
  });

  test("preserves failed label edits and removes only approved browser cache keys", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/inventory");
    const row = page.locator("tr").filter({ hasText: productSku });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Código de barras" }).click();
    const dialog = page.getByRole("dialog");
    const label = dialog.locator("#barcode-print");
    const confirmedWidth = await service.from("settings").select("label_width_mm").single();

    await page.route("**/rest/v1/settings**", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "synthetic failure" }),
      });
    });
    await dialog.locator("#label-width-mm").fill("73");
    await expect(
      dialog.getByText("No se guardó el ajuste. Tus cambios siguen aquí; puedes reintentarlo."),
    ).toBeVisible();
    await expect(dialog.locator("#label-width-mm")).toHaveValue("73");
    await expect(dialog.getByRole("button", { name: "Reintentar guardado" })).toBeVisible();
    await expect(label).toHaveAttribute(
      "style",
      new RegExp(`width: ${confirmedWidth.data.label_width_mm}mm`),
    );
    await expect(dialog.getByRole("button", { name: "Imprimir" })).toBeEnabled();
    await expect(page.getByText("Ajuste de etiqueta guardado")).toHaveCount(0);
    await page.unrouteAll();
    await dialog.getByRole("button", { name: "Reintentar guardado" }).click();
    await expect(dialog.getByText("Ajuste de etiqueta confirmado.")).toBeVisible();

    await page.goto("/settings");
    await page.evaluate(() => {
      for (const key of [
        "lustre_clients",
        "lustre_inventory",
        "lustre_sales",
        "lustre_purchases",
        "chg20_unrelated",
      ]) {
        localStorage.setItem(key, `local:${key}`);
      }
      window.__authStorageKeys = Array.from({ length: sessionStorage.length }, (_, index) =>
        sessionStorage.key(index),
      ).filter((key) => key?.includes("auth-token"));
    });
    await expect
      .poll(() => page.evaluate(() => window.__authStorageKeys.length))
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: "Borrar caché local" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Borrar caché local" }).click();
    await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    const localAfter = await page.evaluate(() => ({
      approved: ["lustre_clients", "lustre_inventory", "lustre_sales", "lustre_purchases"].map(
        (key) => localStorage.getItem(key),
      ),
      unrelated: localStorage.getItem("chg20_unrelated"),
      authKeys: Array.from({ length: sessionStorage.length }, (_, index) =>
        sessionStorage.key(index),
      ).filter((key) => key?.includes("auth-token")),
    }));
    expect(localAfter.approved).toEqual([null, null, null, null]);
    expect(localAfter.unrelated).toBe("local:chg20_unrelated");
    expect(localAfter.authKeys.length).toBeGreaterThan(0);
    const remote = await service.from("clients").select("id").eq("id", clientId).single();
    expect(remote.data.id).toBe(clientId);
  });

  test("denies the settings route to an employee without the settings permission", async ({
    page,
  }) => {
    await login(page, employee);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Acceso restringido" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ajustes" })).toHaveCount(0);
  });
});
