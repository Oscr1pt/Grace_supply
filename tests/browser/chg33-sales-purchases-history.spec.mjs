import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.CHG33_DISPOSABLE_TESTS === "1";
const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const container = process.env.LOCAL_SUPABASE_CONTAINER;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const prefix = `CHG33UI-${suffix}`;
const username = `chg33-ui-${suffix}`;
const email = `${username}@example.test`;
const password = `HistoryUI-${crypto.randomUUID()}-c!`;
const clientName = `CHG33 UI client ${suffix}`;
const supplierName = `CHG33 UI supplier ${suffix}`;
const receiptPrefix = `${prefix}-S-`;
const invoicePrefix = `${prefix}-P-`;
let service;
let authUserId;
let clientId;
let supplierId;
let receiptNumbers = [];
let invoiceNumbers = [];
const limitedUsers = {};

test.describe.serial("CHG-33 Ventas y Compras history browser flows", () => {
  test.skip(
    !enabled,
    "CHG-33 browser tests require the explicitly selected disposable local Supabase stack.",
  );

  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey || !container) {
      throw new Error("CHG-33 requires explicit disposable local Supabase metadata.");
    }
    const parsedUrl = new URL(url);
    if (!["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname)) {
      throw new Error("CHG-33 refuses non-loopback Supabase URLs.");
    }
    if (parsedUrl.port !== "64221" || container !== "supabase_db_grace-chg33-hist1411") {
      throw new Error("CHG-33 refuses a Supabase stack other than its isolated test stack.");
    }

    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    authUserId = created.data.user.id;

    const profile = await service.from("user_profiles").insert({
      auth_user_id: authUserId,
      username,
      name: "Synthetic CHG-33 browser administrator",
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
    if (profile.error) throw profile.error;

    for (const [key, permission] of Object.entries({ sales: "sales", purchases: "purchases" })) {
      const limitedUsername = `${username}-${key}`;
      const limitedPassword = `HistoryUI-${crypto.randomUUID()}-c!`;
      const limitedEmail = `${limitedUsername}@example.test`;
      const limitedIdentity = await service.auth.admin.createUser({
        email: limitedEmail,
        password: limitedPassword,
        email_confirm: true,
      });
      if (limitedIdentity.error) throw limitedIdentity.error;
      limitedUsers[key] = {
        id: limitedIdentity.data.user.id,
        username: limitedUsername,
        password: limitedPassword,
      };
      const limitedProfile = await service.from("user_profiles").insert({
        auth_user_id: limitedIdentity.data.user.id,
        username: limitedUsername,
        name: `Synthetic CHG-33 ${key} employee`,
        role: "employee",
        permissions: [permission],
        active: true,
      });
      if (limitedProfile.error) throw limitedProfile.error;
    }

    const client = await service
      .from("clients")
      .insert({ name: clientName, status: "activo" })
      .select("id")
      .single();
    if (client.error) throw client.error;
    clientId = client.data.id;

    const supplier = await service
      .from("suppliers")
      .insert({ name: supplierName, status: "activo" })
      .select("id")
      .single();
    if (supplier.error) throw supplier.error;
    supplierId = supplier.data.id;

    const now = Date.now();
    const sales = Array.from({ length: 30 }, (_, index) => ({
      receipt_no: `${receiptPrefix}${String(index).padStart(3, "0")}`,
      client_id: clientId,
      subtotal: 100 + index,
      tax_rate: 0,
      tax: 0,
      total: 100 + index,
      payment_type: "contado",
      created_at: new Date(now - index * 86_400_000).toISOString(),
    }));
    const purchases = Array.from({ length: 30 }, (_, index) => ({
      supplier: supplierName,
      supplier_id: supplierId,
      description: `CHG-33 UI purchase ${index}`,
      quantity: 1,
      unit_cost: 200 + index,
      total: 200 + index,
      invoice_no: `${invoicePrefix}${String(index).padStart(3, "0")}`,
      payment_type: "contado",
      created_at: new Date(now - index * 86_400_000).toISOString(),
    }));
    receiptNumbers = sales.map((row) => row.receipt_no);
    invoiceNumbers = purchases.map((row) => row.invoice_no);
    for (let offset = 0; offset < sales.length; offset += 100) {
      const insertedSales = await service.from("sales").insert(sales.slice(offset, offset + 100));
      if (insertedSales.error) throw insertedSales.error;
      const insertedPurchases = await service
        .from("purchases")
        .insert(purchases.slice(offset, offset + 100));
      if (insertedPurchases.error) throw insertedPurchases.error;
    }
  });

  test.afterAll(async () => {
    if (!service) return;
    await service.from("purchases").delete().like("invoice_no", `${invoicePrefix}%`);
    await service.from("sales").delete().like("receipt_no", `${receiptPrefix}%`);
    if (supplierId) await service.from("suppliers").delete().eq("id", supplierId);
    if (clientId) await service.from("clients").delete().eq("id", clientId);
    if (authUserId) {
      await service.from("user_profiles").delete().eq("auth_user_id", authUserId);
      await service.auth.admin.deleteUser(authUserId);
    }
    for (const account of Object.values(limitedUsers)) {
      await service.from("user_profiles").delete().eq("auth_user_id", account.id);
      await service.auth.admin.deleteUser(account.id);
    }
  });

  async function login(page, credentials = { username, password }) {
    await page.goto("/login");
    const submit = page.getByRole("button", { name: "Entrar al sistema" });
    await expect(submit).toBeEnabled();
    const usernameField = page.getByLabel("Usuario");
    const passwordField = page.getByLabel("Contraseña");
    await usernameField.fill(credentials.username);
    await passwordField.fill(credentials.password);
    if ((await usernameField.inputValue()) !== credentials.username) {
      throw new Error("The synthetic username field was not populated.");
    }
    if (!(await passwordField.inputValue()).length) {
      throw new Error("The synthetic password field was not populated.");
    }
    await submit.click();
    await expect(page.getByRole("button", { name: /Cerrar sesi[oó]n/ })).toBeVisible();
  }

  async function choosePeriod(page, label) {
    await page.getByRole("combobox", { name: "Filtrar por período" }).click();
    await page.getByRole("option", { name: label }).click();
  }

  async function countFor(page, kind, count) {
    await expect(page.getByTestId(`${kind}-history-count`)).toContainText(
      `${count} ${count === 1 ? "resultado" : "resultados"}`,
    );
  }

  async function navigateWithKeyboard(page, kind, pageNumber) {
    const rpcName = kind === "sales" ? "search_sales_history" : "search_purchases_history";
    const responsePromise = page.waitForResponse((response) => {
      if (!new URL(response.url()).pathname.endsWith(`/rpc/${rpcName}`)) return false;
      try {
        return response.request().postDataJSON()?.p_page === pageNumber;
      } catch {
        return false;
      }
    });
    const next = page.getByRole("button", { name: "Página siguiente" });
    await next.focus();
    await next.press("Enter");
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
  }

  async function searchFor(page, kind, input, value) {
    const rpcName = kind === "sales" ? "search_sales_history" : "search_purchases_history";
    const responsePromise = page.waitForResponse((response) => {
      if (!new URL(response.url()).pathname.endsWith(`/rpc/${rpcName}`)) return false;
      try {
        return response.request().postDataJSON()?.p_search === value;
      } catch {
        return false;
      }
    });
    await input.fill(value);
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
  }

  test("Ventas busca por recibo, diferencia sin coincidencias y limpia", async ({ page }) => {
    await login(page);
    await page.goto("/sales");
    const search = page.getByRole("searchbox", {
      name: "Buscar ventas por identificador o cliente",
    });
    await searchFor(page, "sales", search, receiptNumbers[12]);
    await expect(page.getByRole("row").filter({ hasText: receiptNumbers[12] })).toBeVisible();
    await countFor(page, "sales", 1);

    await searchFor(page, "sales", search, `${prefix}-not-found`);
    await expect(page.getByText("No hay ventas que coincidan con los filtros.")).toBeVisible();
    await countFor(page, "sales", 0);

    await page
      .getByRole("region", { name: /Filtros del historial de ventas/ })
      .getByRole("button", { name: "Limpiar filtros" })
      .click();
    await countFor(page, "sales", 30);
  });

  test("Ventas filtra días de negocio, rango personalizado y rechaza límites invertidos", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/sales");
    await choosePeriod(page, "Últimos 7 días");
    await countFor(page, "sales", 7);

    await choosePeriod(page, "Personalizado");
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(
      new Date(),
    );
    const start = new Date(`${date}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 2);
    const from = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(
      start,
    );
    await page.getByLabel("Fecha desde").fill(from);
    await page.getByLabel("Fecha hasta").fill(date);
    await countFor(page, "sales", 3);

    await page.getByLabel("Fecha desde").fill(date);
    await page.getByLabel("Fecha hasta").fill(from);
    await expect(page.locator("#sales-history-date-error")).toContainText("fecha inicial");
  });

  test("Ventas pagina 25 filas con orden estable y reinicia al cambiar la búsqueda", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/sales");
    const search = page.getByRole("searchbox", {
      name: "Buscar ventas por identificador o cliente",
    });
    await searchFor(page, "sales", search, prefix);
    await countFor(page, "sales", 30);
    await expect(page.getByRole("row").filter({ hasText: receiptNumbers[0] })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: receiptNumbers[25] })).toHaveCount(0);
    await navigateWithKeyboard(page, "sales", 2);
    await expect(page.getByRole("row").filter({ hasText: receiptNumbers[25] })).toBeVisible();
    await expect(page.getByTestId("sales-history-count")).toContainText("Página 2 de 2");
    await searchFor(page, "sales", search, receiptNumbers[29]);
    await countFor(page, "sales", 1);
    await expect(page.getByTestId("sales-history-count")).toContainText("Página 1 de 1");
  });

  test("Compras busca por factura y proveedor histórico, y muestra cero coincidencias", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/purchases");
    const search = page.getByRole("searchbox", {
      name: "Buscar compras por identificador o proveedor",
    });
    await searchFor(page, "purchases", search, invoiceNumbers[11]);
    await expect(page.getByRole("row").filter({ hasText: invoiceNumbers[11] })).toBeVisible();
    await countFor(page, "purchases", 1);

    await searchFor(page, "purchases", search, supplierName);
    await countFor(page, "purchases", 30);
    await searchFor(page, "purchases", search, `${prefix}-missing`);
    await expect(page.getByText("No hay compras que coincidan con los filtros.")).toBeVisible();
    await countFor(page, "purchases", 0);
  });

  test("Compras filtra por fecha y navega las páginas sin cambiar el orden", async ({ page }) => {
    await login(page);
    await page.goto("/purchases");
    await choosePeriod(page, "Este mes");
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(
      new Date(),
    );
    const monthCount = Array.from({ length: 30 }, (_, index) => {
      const day = new Date(Date.now() - index * 86_400_000);
      return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(day);
    }).filter((day) => day.slice(0, 7) === date.slice(0, 7)).length;
    await countFor(page, "purchases", monthCount);
    await choosePeriod(page, "Personalizado");
    await page.getByLabel("Fecha desde").fill(date);
    await page.getByLabel("Fecha hasta").fill(date);
    await countFor(page, "purchases", 1);
    await page.getByRole("button", { name: "Limpiar filtros" }).click();
    await countFor(page, "purchases", 30);
    await expect(page.getByRole("row").filter({ hasText: invoiceNumbers[0] })).toBeVisible();
    await navigateWithKeyboard(page, "purchases", 2);
    await expect(page.getByRole("row").filter({ hasText: invoiceNumbers[25] })).toBeVisible();
    await expect(page.getByTestId("purchases-history-count")).toContainText("Página 2 de 2");
  });

  test("recibos y anulaciones conservan las restricciones de rol desde las páginas del historial", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/sales");
    const salesRow = page.getByRole("row").filter({ hasText: receiptNumbers[0] });
    const viewReceipt = salesRow.getByRole("button", {
      name: `Ver recibo ${receiptNumbers[0]}`,
    });
    await expect(viewReceipt).toBeVisible();
    await viewReceipt.click();
    await expect(page.getByRole("dialog")).toContainText(`Recibo ${receiptNumbers[0]}`);
    await page.keyboard.press("Escape");

    await salesRow.getByRole("button", { name: `Anular venta ${receiptNumbers[0]}` }).click();
    const saleAnnulDialog = page.getByRole("dialog");
    await expect(saleAnnulDialog).toContainText(`Anular venta ${receiptNumbers[0]}`);
    await saleAnnulDialog.getByRole("button", { name: "Cancelar" }).click();

    await page.goto("/purchases");
    const purchaseRow = page.getByRole("row").filter({ hasText: invoiceNumbers[0] });
    const purchaseAnnul = purchaseRow.getByRole("button", {
      name: `Anular compra ${invoiceNumbers[0]}`,
    });
    await expect(purchaseAnnul).toBeVisible();
    await purchaseAnnul.click();
    const purchaseAnnulDialog = page.getByRole("dialog");
    await expect(purchaseAnnulDialog).toContainText(`Anular compra ${invoiceNumbers[0]}`);
    await purchaseAnnulDialog.getByRole("button", { name: "Cancelar" }).click();

    const browser = page.context().browser();
    expect(browser).not.toBeNull();
    const salesContext = await browser.newContext();
    const salesEmployeePage = await salesContext.newPage();
    try {
      await login(salesEmployeePage, limitedUsers.sales);
      await salesEmployeePage.goto("/sales");
      const employeeSaleRow = salesEmployeePage
        .getByRole("row")
        .filter({ hasText: receiptNumbers[0] });
      await expect(
        employeeSaleRow.getByRole("button", { name: `Ver recibo ${receiptNumbers[0]}` }),
      ).toBeVisible();
      await expect(
        employeeSaleRow.getByRole("button", { name: `Anular venta ${receiptNumbers[0]}` }),
      ).toHaveCount(0);
    } finally {
      await salesContext.close();
    }

    const purchasesContext = await browser.newContext();
    const purchasesEmployeePage = await purchasesContext.newPage();
    try {
      await login(purchasesEmployeePage, limitedUsers.purchases);
      await purchasesEmployeePage.goto("/purchases");
      const employeePurchaseRow = purchasesEmployeePage
        .getByRole("row")
        .filter({ hasText: invoiceNumbers[0] });
      await expect(
        employeePurchaseRow.getByRole("button", {
          name: `Anular compra ${invoiceNumbers[0]}`,
        }),
      ).toHaveCount(0);
    } finally {
      await purchasesContext.close();
    }
  });

  test("ambos historiales son responsivos, recuperan errores de lectura y no mutan documentos", async ({
    page,
  }) => {
    const salesBefore = await service
      .from("sales")
      .select("id,total,tax,receipt_no")
      .like("receipt_no", `${receiptPrefix}%`)
      .order("receipt_no");
    const purchasesBefore = await service
      .from("purchases")
      .select("id,total,invoice_no")
      .like("invoice_no", `${invoicePrefix}%`)
      .order("invoice_no");
    expect(salesBefore.error).toBeNull();
    expect(purchasesBefore.error).toBeNull();

    await login(page);
    for (const route of ["/sales", "/purchases"]) {
      await page.goto(route);
      for (const width of [320, 375, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        const dimensions = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          document: document.documentElement.scrollWidth,
        }));
        expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
      }
    }

    await page.route("**/rest/v1/rpc/search_purchases_history", (route) => route.abort());
    await page
      .getByRole("searchbox", { name: "Buscar compras por identificador o proveedor" })
      .fill(invoiceNumbers[1]);
    await expect(page.getByText("No se pudo cargar el historial.")).toBeVisible();
    await page.unroute("**/rest/v1/rpc/search_purchases_history");
    await page.getByRole("button", { name: "Reintentar" }).click();
    await countFor(page, "purchases", 1);

    const salesAfter = await service
      .from("sales")
      .select("id,total,tax,receipt_no")
      .like("receipt_no", `${receiptPrefix}%`)
      .order("receipt_no");
    const purchasesAfter = await service
      .from("purchases")
      .select("id,total,invoice_no")
      .like("invoice_no", `${invoicePrefix}%`)
      .order("invoice_no");
    expect(salesAfter.error).toBeNull();
    expect(purchasesAfter.error).toBeNull();
    expect(salesAfter.data).toEqual(salesBefore.data);
    expect(purchasesAfter.data).toEqual(purchasesBefore.data);

    await page.goto("/sales");
    let releaseOlderResponse;
    let markOlderFetched;
    const olderFetched = new Promise((resolve) => {
      markOlderFetched = resolve;
    });
    const olderResponseGate = new Promise((resolve) => {
      releaseOlderResponse = resolve;
    });
    const olderSearch = receiptNumbers[10];
    const latestSearch = receiptNumbers[11];
    await page.route("**/rest/v1/rpc/search_sales_history", async (route) => {
      if (route.request().postDataJSON()?.p_search === olderSearch) {
        const response = await route.fetch();
        markOlderFetched();
        await olderResponseGate;
        try {
          await route.fulfill({ response });
        } catch {
          // The real request may have been aborted when the newer filter superseded it.
        }
      } else {
        await route.continue();
      }
    });
    const search = page.getByRole("searchbox", {
      name: "Buscar ventas por identificador o cliente",
    });
    await search.fill(olderSearch);
    await olderFetched;
    const latestResponse = page.waitForResponse((response) => {
      if (!new URL(response.url()).pathname.endsWith("/rpc/search_sales_history")) return false;
      try {
        return response.request().postDataJSON()?.p_search === latestSearch;
      } catch {
        return false;
      }
    });
    await search.fill(latestSearch);
    expect((await latestResponse).ok()).toBeTruthy();
    await expect(page.getByRole("row").filter({ hasText: latestSearch })).toBeVisible();
    releaseOlderResponse();
    await page.unroute("**/rest/v1/rpc/search_sales_history");
    await expect(page.getByRole("row").filter({ hasText: latestSearch })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: olderSearch })).toHaveCount(0);
  });

  test("al eliminar solo los fixtures sintéticos, ambos historiales muestran el estado vacío", async ({
    page,
  }) => {
    const purchasesCleanup = await service
      .from("purchases")
      .delete()
      .like("invoice_no", `${invoicePrefix}%`);
    const salesCleanup = await service
      .from("sales")
      .delete()
      .like("receipt_no", `${receiptPrefix}%`);
    if (purchasesCleanup.error) throw purchasesCleanup.error;
    if (salesCleanup.error) throw salesCleanup.error;

    await login(page);
    await page.goto("/sales");
    await expect(page.getByText("Aún no hay ventas.")).toBeVisible();
    await countFor(page, "sales", 0);
    await page.goto("/purchases");
    await expect(page.getByText("Aún no hay compras.")).toBeVisible();
    await countFor(page, "purchases", 0);
  });
});
