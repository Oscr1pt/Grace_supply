import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.CHG35_DISPOSABLE_TESTS === "1";
const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const container = process.env.LOCAL_SUPABASE_CONTAINER;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const username = `chg35-ui-${suffix}`;
const email = `${username}@example.test`;
const password = `Local-${crypto.randomUUID()}-a!`;
const invoiceNo = `CHG35-UI-${suffix}`;
let service;
let authUserId;
let supplierId;
let itemIds = [];
let reproductionItemId;

async function loginAsAdmin(page) {
  await page.goto("/login");
  const submit = page.getByRole("button", { name: "Entrar al sistema" });
  await expect(submit).toBeEnabled({ timeout: 20_000 });
  const usernameInput = page.getByLabel("Usuario");
  const passwordInput = page.getByLabel("Contraseña");
  await usernameInput.fill(username);
  await passwordInput.fill(password);
  await expect(usernameInput).toHaveValue(username);
  await expect(passwordInput).toHaveValue(password);
  await submit.click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 20_000 });
  await expect(page.getByRole("link", { name: "Panel" })).toBeVisible();
}

test.describe.serial("CHG-35 multi-line purchase browser flow", () => {
  test.skip(!enabled, "CHG-35 requires its explicitly selected disposable local stack.");

  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey || !container) {
      throw new Error("CHG-35 requires explicit disposable local Supabase metadata.");
    }
    const parsed = new URL(url);
    if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
      throw new Error("CHG-35 refuses non-loopback Supabase URLs.");
    }
    if (parsed.port !== "65321" || container !== "supabase_db_chg35multiline20261115") {
      throw new Error("CHG-35 refuses a different Supabase test stack.");
    }

    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const identity = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (identity.error) throw identity.error;
    authUserId = identity.data.user.id;
    const profile = await service.from("user_profiles").insert({
      auth_user_id: authUserId,
      username,
      name: "Synthetic CHG-35 browser administrator",
      role: "admin",
      permissions: ["dashboard", "suppliers", "inventory", "purchases", "settings"],
      active: true,
    });
    if (profile.error) throw profile.error;
    const supplier = await service
      .from("suppliers")
      .insert({ name: `CHG35 browser supplier ${suffix}`, status: "activo" })
      .select("id")
      .single();
    if (supplier.error) throw supplier.error;
    supplierId = supplier.data.id;
    const products = await service
      .from("inventory")
      .insert([
        {
          sku: `CHG35UI-${suffix}-A`,
          kind: "joya",
          name: `CHG35 browser item A ${suffix}`,
          category: "otro",
          cost_price: 2,
          price: 10,
          quantity: 0,
        },
        {
          sku: `CHG35UI-${suffix}-B`,
          kind: "joya",
          name: `CHG35 browser item B ${suffix}`,
          category: "otro",
          cost_price: 2,
          price: 10,
          quantity: 0,
        },
      ])
      .select("id");
    if (products.error) throw products.error;
    itemIds = products.data.map(({ id }) => id);
    const reproductionItem = await service
      .from("inventory")
      .insert({
        sku: `GS-WM3Z95-${suffix}`,
        kind: "joya",
        name: "Maquinita",
        category: "otro",
        cost_price: 799.97,
        price: 999.99,
        quantity: 0,
      })
      .select("id")
      .single();
    if (reproductionItem.error) throw reproductionItem.error;
    reproductionItemId = reproductionItem.data.id;
  });

  test.afterAll(async () => {
    if (!service) return;
    const purchases = await service
      .from("purchases")
      .select("id")
      .ilike("invoice_no", `%${suffix}%`);
    if (!purchases.error && purchases.data.length) {
      const purchaseIds = purchases.data.map(({ id }) => id);
      await service.from("purchase_lines").delete().in("purchase_id", purchaseIds);
      await service.from("supplier_credits").delete().in("purchase_id", purchaseIds);
      await service.from("purchases").delete().in("id", purchaseIds);
    }
    if (supplierId) await service.from("suppliers").delete().eq("id", supplierId);
    if (itemIds.length) await service.from("inventory").delete().in("id", itemIds);
    if (reproductionItemId) await service.from("inventory").delete().eq("id", reproductionItemId);
    if (authUserId) {
      await service.from("user_profiles").delete().eq("auth_user_id", authUserId);
      await service.auth.admin.deleteUser(authUserId);
    }
  });

  test("production build preserves login, session, and protected navigation", async ({ page }) => {
    const consoleErrorOrigins = [];
    let pageErrors = 0;
    const authStatuses = [];
    const externalHosts = new Set();
    const expectedExternalHosts = ["fonts.googleapis.com", "fonts.gstatic.com"];
    const allowedConsoleErrorOrigins = new Set([
      "127.0.0.1/favicon.ico",
      "127.0.0.1/functions/v1/username-login",
    ]);
    const failedRequests = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        const source = message.location().url;
        try {
          const parsed = new URL(source);
          if (!expectedExternalHosts.includes(parsed.hostname))
            consoleErrorOrigins.push(parsed.hostname + parsed.pathname);
        } catch {
          consoleErrorOrigins.push("unknown-source");
        }
      }
    });
    page.on("pageerror", () => {
      pageErrors += 1;
    });
    page.on("request", (request) => {
      const requestUrl = new URL(request.url());
      if (!["127.0.0.1", "localhost", "::1"].includes(requestUrl.hostname)) {
        externalHosts.add(requestUrl.hostname);
      }
    });
    page.on("response", (response) => {
      const responseUrl = new URL(response.url());
      if (responseUrl.pathname.endsWith("/functions/v1/username-login")) {
        authStatuses.push(response.status());
      }
    });
    page.on("requestfailed", (request) => {
      failedRequests.push({
        host: new URL(request.url()).hostname,
        path: new URL(request.url()).pathname,
      });
    });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel("Contrase\u00f1a").fill(`${password}-incorrecta`);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page.getByLabel("Contrase\u00f1a")).toHaveValue("");

    await page.getByLabel("Contrase\u00f1a").fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 20_000 });
    await expect(page.getByRole("link", { name: "Panel" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toBeVisible();

    await page.getByRole("link", { name: "Compras" }).click();
    await expect(page).toHaveURL(/\/purchases(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Compras" })).toBeVisible();
    await expect(page.getByRole("status")).toBeHidden();
    await page.getByRole("link", { name: "Panel" }).click();
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
    await page.getByRole("button", { name: "Cerrar sesi\u00f3n" }).click();
    await expect(page).toHaveURL(/\/login(?:\?|$)/);

    await page.goto("/purchases");
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel("Contrase\u00f1a").fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 20_000 });

    expect(authStatuses).toContain(401);
    expect(authStatuses.filter((status) => status >= 200 && status < 300)).toHaveLength(2);
    expect([...externalHosts].sort()).toEqual(expectedExternalHosts);
    expect(failedRequests.filter(({ host }) => !expectedExternalHosts.includes(host))).toEqual([]);
    expect(pageErrors).toBe(0);
    expect(consoleErrorOrigins.filter((source) => !allowedConsoleErrorOrigins.has(source))).toEqual(
      [],
    );
  });
  test("posts two inventory lines and shows saved line details", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/purchases");
    await page.getByRole("button", { name: "Nueva compra" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Detalle de productos")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole("button", { name: "Nueva compra" }).click();
      await expect(dialog).toBeVisible();
      await dialog.evaluate((element) => {
        for (const animation of element.getAnimations()) animation.finish();
      });
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      if (width !== 1280) {
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
      }
    }
    await dialog.getByRole("combobox", { name: "Proveedor registrado" }).click();
    await page
      .getByRole("option", { name: new RegExp(`CHG35 browser supplier ${suffix}`) })
      .click();
    await dialog.getByLabel("Nº Factura Proveedor").fill(invoiceNo);

    for (const [index, id] of itemIds.entries()) {
      if (index === 1) await dialog.getByTestId("purchase-add-line").click();
      await dialog.getByRole("combobox", { name: `Producto ${index + 1}` }).click();
      const product = await service.from("inventory").select("sku,name").eq("id", id).single();
      if (product.error) throw product.error;
      await page.getByRole("option", { name: new RegExp(product.data.name) }).click();
      await dialog.getByTestId(`purchase-line-quantity-${index + 1}`).fill(String(index + 2));
      await dialog
        .getByTestId(`purchase-line-cost-${index + 1}`)
        .fill(index === 0 ? "3.25" : "4.50");
    }
    await expect(dialog).toContainText("20.00");
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: /Cr/ }).click();
    await dialog.locator('input[type="date"]').fill("2027-01-31");
    const restockToggle = dialog.getByLabel(/Actualizar inventario de los productos vinculados/);
    await expect(restockToggle).toBeChecked();
    await expect(dialog).toContainText(
      "Al confirmar la compra, aumentarán las existencias de los productos seleccionados del inventario. Los productos no registrados no se crearán automáticamente.",
    );
    await restockToggle.uncheck();
    await dialog.getByRole("button", { name: "Confirmar compra" }).click();
    const row = page.getByRole("row").filter({ hasText: invoiceNo });
    await expect(row).toBeVisible({ timeout: 15_000 });
    const saved = await service
      .from("purchases")
      .select("id,total")
      .eq("invoice_no", invoiceNo)
      .single();
    if (saved.error) throw saved.error;
    const payable = await service
      .from("supplier_credits")
      .select("id,total,balance")
      .eq("purchase_id", saved.data.id);
    if (payable.error) throw payable.error;
    expect(payable.data).toHaveLength(1);
    expect(payable.data[0]).toMatchObject({ total: 20, balance: 20 });
    const savedLines = await service
      .from("purchase_lines")
      .select("item_id,quantity,restocked")
      .eq("purchase_id", saved.data.id)
      .order("line_number");
    if (savedLines.error) throw savedLines.error;
    expect(savedLines.data).toHaveLength(2);
    expect(savedLines.data.every((line) => !line.restocked)).toBe(true);
    const stockAfter = await service.from("inventory").select("quantity").in("id", itemIds);
    if (stockAfter.error) throw stockAfter.error;
    expect(stockAfter.data.map((row) => row.quantity)).toEqual([0, 0]);
    await expect(row).toContainText("2 productos");
    await row.getByRole("button", { name: `Ver detalles de compra ${invoiceNo}` }).click();
    const details = page.getByRole("dialog");
    await expect(details).toContainText(`Detalle de compra ${invoiceNo}`);
    await expect(details).toContainText(`CHG35 browser item A ${suffix}`);
    await expect(details).toContainText(`CHG35 browser item B ${suffix}`);
    await expect(details).toContainText("20.00");
    expect(Number(saved.data.total)).toBe(20);
  });

  test("recovers a committed multi-line purchase after reload without reposting", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const invoice = `${invoiceNo}-UNCERTAIN-COMMITTED`;
    await page.goto("/purchases");
    await page.getByRole("button", { name: "Nueva compra" }).click();
    let postCalls = 0;
    let originalKey;
    await page.route("**/rest/v1/rpc/post_purchase", async (route) => {
      postCalls += 1;
      originalKey = route.request().postDataJSON().p_request.idempotency_key;
      const response = await route.fetch();
      if (!response.ok()) throw new Error(`Synthetic purchase RPC rejected (${response.status()})`);
      await response.body();
      await route.abort("timedout");
    });
    await page.route("**/rest/v1/rpc/get_business_operation", (route) => route.abort("failed"));

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Proveedor registrado" }).click();
    await page
      .getByRole("option", { name: new RegExp(`CHG35 browser supplier ${suffix}`) })
      .click();
    await dialog.locator("#purchase-invoice-number").fill(invoice);
    const linkedItem = await service.from("inventory").select("name").eq("id", itemIds[0]).single();
    if (linkedItem.error) throw linkedItem.error;
    await dialog.getByRole("combobox", { name: "Producto 1" }).click();
    await page.getByRole("option", { name: new RegExp(linkedItem.data.name) }).click();
    await dialog.getByTestId("purchase-line-quantity-1").fill("2");
    await dialog.getByTestId("purchase-line-cost-1").fill("3.25");
    await dialog.getByTestId("purchase-add-line").click();
    await dialog.getByTestId("purchase-line-2").getByRole("combobox").first().click();
    await page.getByRole("option", { name: "No registrado" }).click();
    await dialog.getByTestId("purchase-line-name-2").fill("Servicio incierto");
    await dialog.getByTestId("purchase-line-quantity-2").fill("3");
    await dialog.getByTestId("purchase-line-cost-2").fill("4.50");
    await dialog.getByRole("button", { name: "Confirmar compra" }).click();
    await expect(dialog.getByRole("alert").filter({ hasText: /No se.*confirmaci/ })).toBeVisible();
    expect(postCalls).toBe(1);

    const pendingBeforeReload = await page.evaluate(() => {
      const storageKey = Object.keys(sessionStorage).find((key) =>
        key.startsWith("grace.pending-business-operation.v1:"),
      );
      return storageKey ? JSON.parse(sessionStorage.getItem(storageKey)) : null;
    });
    expect(pendingBeforeReload.idempotencyKey).toBe(originalKey);
    expect(pendingBeforeReload.request.lines).toHaveLength(2);
    expect(pendingBeforeReload.context.lines).toHaveLength(2);
    const persisted = await service
      .from("purchases")
      .select("id,total")
      .eq("invoice_no", invoice)
      .single();
    if (persisted.error) throw persisted.error;
    expect(persisted.data.total).toBe(20);
    const persistedLines = await service
      .from("purchase_lines")
      .select("item_id,quantity")
      .eq("purchase_id", persisted.data.id);
    if (persistedLines.error) throw persistedLines.error;
    expect(persistedLines.data).toHaveLength(2);
    const stock = await service.from("inventory").select("id,quantity").in("id", itemIds);
    if (stock.error) throw stock.error;
    expect(Object.fromEntries(stock.data.map((row) => [row.id, row.quantity]))).toEqual({
      [itemIds[0]]: 2,
      [itemIds[1]]: 0,
    });

    await page.reload();
    const restored = page.getByRole("dialog");
    await expect(restored).toBeVisible();
    await expect(restored.getByTestId("purchase-line-quantity-1")).toHaveValue("2");
    await expect(restored.getByTestId("purchase-line-quantity-2")).toHaveValue("3");
    await expect(restored.getByRole("combobox", { name: "Producto 1" })).toContainText(
      `CHG35 browser item A ${suffix}`,
    );
    await expect(restored.getByTestId("purchase-line-name-2")).toHaveValue("Servicio incierto");
    await expect(restored.getByRole("button", { name: "Confirmar compra" })).toBeDisabled();
    await page.unroute("**/rest/v1/rpc/get_business_operation");
    await restored.getByRole("button", { name: /Consultar operaci/ }).click();
    await expect(page.getByText("Compra reconciliada con el resultado persistido")).toBeVisible();
    expect(postCalls).toBe(1);
    const onePurchase = await service.from("purchases").select("id").eq("invoice_no", invoice);
    if (onePurchase.error) throw onePurchase.error;
    expect(onePurchase.data).toHaveLength(1);
    const payables = await service
      .from("supplier_credits")
      .select("id")
      .eq("purchase_id", persisted.data.id);
    if (payables.error) throw payables.error;
    expect(payables.data).toHaveLength(0);
  });

  test("keeps an unconfirmed purchase locked to its original key after reload", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const invoice = `${invoiceNo}-UNCERTAIN-UNKNOWN`;
    await page.goto("/purchases");
    await page.getByRole("button", { name: "Nueva compra" }).click();
    let postCalls = 0;
    await page.route("**/rest/v1/rpc/post_purchase", async (route) => {
      postCalls += 1;
      await route.abort("failed");
    });
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Proveedor registrado" }).click();
    await page
      .getByRole("option", { name: new RegExp(`CHG35 browser supplier ${suffix}`) })
      .click();
    await dialog.locator("#purchase-invoice-number").fill(invoice);
    for (const [index, id] of itemIds.entries()) {
      if (index > 0) await dialog.getByTestId("purchase-add-line").click();
      const item = await service.from("inventory").select("name").eq("id", id).single();
      if (item.error) throw item.error;
      await dialog.getByRole("combobox", { name: `Producto ${index + 1}` }).click();
      await page.getByRole("option", { name: new RegExp(item.data.name) }).click();
      await dialog.getByTestId(`purchase-line-quantity-${index + 1}`).fill("1");
      await dialog.getByTestId(`purchase-line-cost-${index + 1}`).fill("2.00");
    }
    await dialog.getByRole("button", { name: "Confirmar compra" }).click();
    await expect(dialog.getByRole("alert").filter({ hasText: /No se.*confirmaci/ })).toBeVisible();
    expect(postCalls).toBe(1);
    const pendingBeforeReload = await page.evaluate(() => {
      const storageKey = Object.keys(sessionStorage).find((key) =>
        key.startsWith("grace.pending-business-operation.v1:"),
      );
      return storageKey ? JSON.parse(sessionStorage.getItem(storageKey)) : null;
    });
    expect(pendingBeforeReload.request.invoice_no).toBe(invoice);
    const originalKey = pendingBeforeReload.idempotencyKey;

    await page.reload();
    const restored = page.getByRole("dialog");
    await expect(restored).toBeVisible();
    await expect(restored.getByRole("button", { name: "Confirmar compra" })).toBeDisabled();
    await restored.getByRole("button", { name: /Consultar operaci/ }).click();
    await expect(page.getByText(/operaci.*todav[ií]a no aparece confirmada/)).toBeVisible();
    await expect(restored.getByRole("button", { name: "Confirmar compra" })).toBeDisabled();
    expect(postCalls).toBe(1);
    const retained = await page.evaluate(() => {
      const storageKey = Object.keys(sessionStorage).find((key) =>
        key.startsWith("grace.pending-business-operation.v1:"),
      );
      return storageKey ? JSON.parse(sessionStorage.getItem(storageKey)) : null;
    });
    expect(retained.idempotencyKey).toBe(originalKey);
    const noPurchase = await service.from("purchases").select("id").eq("invoice_no", invoice);
    if (noPurchase.error) throw noPurchase.error;
    expect(noPurchase.data).toHaveLength(0);
  });

  test("shows detail loading and error states, then permits rereading history", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/purchases");
    const detailsButton = page.getByRole("button", {
      name: `Ver detalles de compra ${invoiceNo}`,
      exact: true,
    });
    await expect(detailsButton).toBeVisible();

    let releaseResponse;
    let notifyRequestSeen;
    let markResponseDelivered;
    const responseGate = new Promise((resolve) => {
      releaseResponse = resolve;
    });
    const requestSeen = new Promise((resolve) => {
      notifyRequestSeen = resolve;
    });
    const responseDelivered = new Promise((resolve) => {
      markResponseDelivered = resolve;
    });
    await page.route("**/rest/v1/purchase_lines**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      notifyRequestSeen();
      await responseGate;
      await route.fulfill({
        status: 400,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "apikey,authorization,content-type",
          "access-control-allow-methods": "GET,OPTIONS",
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "synthetic detail read failure" }),
      });
      markResponseDelivered();
    });
    await detailsButton.click();
    const detail = page.getByRole("dialog");
    await requestSeen;
    await expect(detail.getByText(/Cargando detalle/)).toBeVisible();
    releaseResponse();
    await responseDelivered;
    await expect(
      detail.getByRole("heading", { name: "No se pudo cargar el detalle" }),
    ).toBeVisible();
    await page.unroute("**/rest/v1/purchase_lines**");
    await page.keyboard.press("Escape");
    await expect(detail).toBeHidden();
    await detailsButton.click();
    await expect(page.getByRole("dialog")).toContainText(`CHG35 browser item A ${suffix}`);
    await expect(page.getByRole("dialog")).toContainText(`CHG35 browser item B ${suffix}`);
  });

  test("validates line editing and retains the draft after a server rejection", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const invoice = `${invoiceNo}-VALIDATION`;
    await page.goto("/purchases");
    await page.getByRole("button", { name: "Nueva compra" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Proveedor registrado" }).click();
    await page
      .getByRole("option", { name: new RegExp(`CHG35 browser supplier ${suffix}`) })
      .click();
    await dialog.locator("#purchase-invoice-number").fill(invoice);
    const productA = await service.from("inventory").select("name").eq("id", itemIds[0]).single();
    const productB = await service.from("inventory").select("name").eq("id", itemIds[1]).single();
    if (productA.error) throw productA.error;
    if (productB.error) throw productB.error;
    await dialog.getByRole("combobox", { name: "Producto 1" }).click();
    await page.getByRole("option", { name: new RegExp(productA.data.name) }).click();
    await dialog.getByTestId("purchase-add-line").click();
    await dialog.getByRole("combobox", { name: "Producto 2" }).click();
    await expect(page.getByRole("option", { name: new RegExp(productA.data.name) })).toBeDisabled();
    await page.getByRole("option", { name: new RegExp(productB.data.name) }).click();

    await dialog.getByTestId("purchase-line-quantity-1").fill("1.5");
    await dialog.getByTestId("purchase-line-cost-2").fill("1.001");
    await dialog.getByRole("button", { name: "Confirmar compra" }).click();
    await expect(dialog.getByTestId("purchase-line-error-1-quantity")).toContainText(
      "Línea 1: la cantidad debe ser un entero",
    );
    await expect(dialog.getByTestId("purchase-line-quantity-1")).toHaveValue("1.5");
    await expect(dialog.getByTestId("purchase-line-cost-2")).toHaveValue("1.001");
    const beforeReject = await service.from("purchases").select("id").eq("invoice_no", invoice);
    if (beforeReject.error) throw beforeReject.error;
    expect(beforeReject.data).toHaveLength(0);

    await dialog.getByTestId("purchase-line-quantity-1").fill("2");
    await dialog.getByRole("button", { name: "Confirmar compra" }).click();
    await expect(dialog.getByTestId("purchase-line-error-2-unitCost")).toContainText(
      "Línea 2: el costo debe ser cero o mayor",
    );
    await expect(dialog.getByTestId("purchase-line-cost-2")).toHaveValue("1.001");

    await dialog.getByTestId("purchase-line-cost-2").fill("1.00");
    await dialog.getByRole("button", { name: "Quitar línea 2" }).click();
    await expect(dialog.getByTestId("purchase-line-2")).toHaveCount(0);
    await expect(dialog.getByTestId("purchase-line-quantity-1")).toHaveValue("2");
    let postCalls = 0;
    await page.route("**/rest/v1/rpc/post_purchase", async (route) => {
      postCalls += 1;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ code: "23514", message: "synthetic server validation rejection" }),
      });
    });
    await dialog.getByRole("button", { name: "Confirmar compra" }).click();
    await expect(page.getByText(/servicio rechaz/i)).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#purchase-invoice-number")).toHaveValue(invoice);
    await expect(dialog.getByTestId("purchase-line-quantity-1")).toHaveValue("2");
    expect(postCalls).toBe(1);
    const afterReject = await service.from("purchases").select("id").eq("invoice_no", invoice);
    if (afterReject.error) throw afterReject.error;
    expect(afterReject.data).toHaveLength(0);
  });

  test("retains the legacy no-linked-product purchase path", async ({ page }) => {
    await loginAsAdmin(page);

    const legacyInvoice = `${invoiceNo}-UNLINKED`;
    await page.goto("/purchases");
    await page.getByRole("button", { name: "Nueva compra" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Proveedor registrado" }).click();
    await page
      .getByRole("option", { name: new RegExp(`CHG35 browser supplier ${suffix}`) })
      .click();
    await dialog.getByLabel("Nº Factura Proveedor").fill(legacyInvoice);
    await dialog.getByLabel("Descripción de la compra").fill("Synthetic unlinked purchase");
    await dialog.getByRole("radio", { name: "Compra sin productos detallados" }).click();
    await dialog.getByLabel("Cantidad").fill("2");
    await dialog.getByLabel("Costo unitario").fill("9.99");
    await dialog.getByRole("button", { name: "Confirmar compra" }).click();
    const row = page.getByRole("row").filter({ hasText: legacyInvoice });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: `Ver detalles de compra ${legacyInvoice}` }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "Compra histórica sin producto vinculado. Se conserva su descripción original.",
    );
  });

  test("posts mixed linked and manual purchase lines and labels saved details", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const mixedInvoice = `${invoiceNo}-MIXED`;
    const stockBeforeResult = await service
      .from("inventory")
      .select("id,quantity")
      .in("id", itemIds);
    if (stockBeforeResult.error) throw stockBeforeResult.error;
    const stockBefore = Object.fromEntries(
      stockBeforeResult.data.map((row) => [row.id, row.quantity]),
    );
    await page.goto("/purchases");
    await page.getByRole("button", { name: "Nueva compra" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Proveedor registrado" }).click();
    await page
      .getByRole("option", { name: new RegExp(`CHG35 browser supplier ${suffix}`) })
      .click();
    await dialog.locator("#purchase-invoice-number").fill(mixedInvoice);

    const linkedProduct = await service
      .from("inventory")
      .select("name")
      .eq("id", itemIds[0])
      .single();
    if (linkedProduct.error) throw linkedProduct.error;
    await dialog.getByRole("combobox", { name: "Producto 1" }).click();
    await page.getByRole("option", { name: new RegExp(linkedProduct.data.name) }).click();
    await dialog.getByTestId("purchase-line-quantity-1").fill("1");
    await dialog.getByTestId("purchase-line-cost-1").fill("2.50");

    await dialog.getByTestId("purchase-add-line").click();
    await dialog.getByTestId("purchase-line-2").getByRole("combobox").first().click();
    await page.getByRole("option", { name: "No registrado" }).click();
    await dialog.getByTestId("purchase-line-name-2").fill("Flete de prueba");
    await dialog.getByTestId("purchase-line-quantity-2").fill("2");
    await dialog.getByTestId("purchase-line-cost-2").fill("3.00");

    await dialog.getByTestId("purchase-add-line").click();
    await dialog.getByTestId("purchase-line-3").getByRole("combobox").first().click();
    await page.getByRole("option", { name: "No registrado" }).click();
    await dialog.getByTestId("purchase-line-name-3").fill("Flete de prueba");
    await dialog.getByTestId("purchase-line-quantity-3").fill("1");
    await dialog.getByTestId("purchase-line-cost-3").fill("1.25");
    await dialog.getByTestId("purchase-line-name-2").fill(" Flete de prueba");
    await dialog.getByRole("button", { name: "Confirmar compra" }).click();
    await expect(dialog.getByTestId("purchase-line-error-2-manualName")).toContainText(
      "elimina los espacios al inicio o al final del nombre",
    );
    const invalidDraft = await service
      .from("purchases")
      .select("id")
      .eq("invoice_no", mixedInvoice);
    if (invalidDraft.error) throw invalidDraft.error;
    expect(invalidDraft.data).toHaveLength(0);
    await dialog.getByTestId("purchase-line-name-2").fill("Flete de prueba");
    await expect(dialog).toContainText("9.75");
    await expect(
      dialog.getByLabel(/Actualizar inventario de los productos vinculados/),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Confirmar compra" }).click();

    const row = page.getByRole("row").filter({ hasText: mixedInvoice });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText("Vinculado:");
    await expect(row).toContainText("No registrado: Flete de prueba × 2");
    const purchase = await service
      .from("purchases")
      .select("id,total")
      .eq("invoice_no", mixedInvoice)
      .single();
    if (purchase.error) throw purchase.error;
    expect(purchase.data.total).toBe(9.75);
    const lines = await service
      .from("purchase_lines")
      .select("item_id,name_snapshot,quantity,subtotal,restocked")
      .eq("purchase_id", purchase.data.id)
      .order("line_number");
    if (lines.error) throw lines.error;
    expect(lines.data).toHaveLength(3);
    expect(lines.data[0]).toMatchObject({ item_id: itemIds[0], restocked: true });
    expect(
      lines.data.slice(1).map((line) => [line.item_id, line.name_snapshot, line.restocked]),
    ).toEqual([
      [null, "Flete de prueba", false],
      [null, "Flete de prueba", false],
    ]);
    const stockAfterResult = await service
      .from("inventory")
      .select("id,quantity")
      .in("id", itemIds);
    if (stockAfterResult.error) throw stockAfterResult.error;
    const stockAfter = Object.fromEntries(
      stockAfterResult.data.map((row) => [row.id, row.quantity]),
    );
    expect(stockAfter).toEqual({
      [itemIds[0]]: stockBefore[itemIds[0]] + 1,
      [itemIds[1]]: stockBefore[itemIds[1]],
    });

    await row.getByRole("button", { name: `Ver detalles de compra ${mixedInvoice}` }).click();
    const details = page.getByRole("dialog");
    await expect(details).toContainText("Producto vinculado");
    await expect(details).toContainText("Producto no registrado");
    await expect(details).toContainText("Flete de prueba");
  });

  test("identifies, focuses, clears, and removes the exact invalid manual line", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/purchases");
    await page.getByRole("button", { name: "Nueva compra" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Proveedor registrado" }).click();
    await page
      .getByRole("option", { name: new RegExp(`CHG35 browser supplier ${suffix}`) })
      .click();
    await dialog.locator("#purchase-invoice-number").fill(`${invoiceNo}-LINE-ERRORS`);

    const linkedName = await service.from("inventory").select("name").eq("id", itemIds[0]).single();
    if (linkedName.error) throw linkedName.error;
    const linkedSecondName = await service
      .from("inventory")
      .select("name")
      .eq("id", itemIds[1])
      .single();
    if (linkedSecondName.error) throw linkedSecondName.error;
    await dialog.getByRole("combobox", { name: "Producto 1" }).click();
    await page.getByRole("option", { name: new RegExp(linkedName.data.name) }).click();
    await dialog.getByTestId("purchase-line-quantity-1").fill("1");
    await dialog.getByTestId("purchase-line-cost-1").fill("2.00");

    await dialog.getByTestId("purchase-add-line").click();
    await dialog.getByTestId("purchase-line-2").getByRole("combobox").first().click();
    await page.getByRole("option", { name: "No registrado" }).click();
    await dialog.getByTestId("purchase-add-line").click();
    await dialog.getByTestId("purchase-line-3").getByRole("combobox").first().click();
    await page.getByRole("option", { name: "No registrado" }).click();
    await dialog.getByTestId("purchase-line-name-3").fill(" Servicio aprobado");
    await dialog.getByTestId("purchase-line-quantity-3").fill("1");
    await dialog.getByTestId("purchase-line-cost-3").fill("3.00");

    await dialog.getByRole("button", { name: "Confirmar compra" }).click();
    const secondError = dialog.getByTestId("purchase-line-error-2-manualName");
    await expect(secondError).toHaveText("Línea 2: escribe el nombre del producto no registrado.");
    await expect(dialog.getByTestId("purchase-line-error-3-manualName")).toHaveText(
      "Línea 3: elimina los espacios al inicio o al final del nombre.",
    );
    await expect(dialog.getByTestId("purchase-line-name-2")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(dialog.getByTestId("purchase-line-name-2")).toHaveClass(/border-destructive/);
    await expect(dialog.getByTestId("purchase-line-name-3")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect
      .poll(() =>
        dialog
          .getByTestId("purchase-line-name-2")
          .evaluate((element) => element === document.activeElement),
      )
      .toBe(true);

    await dialog.getByTestId("purchase-line-name-2").fill("Mesa gamer");
    await expect(secondError).toHaveCount(0);
    await expect(dialog.getByTestId("purchase-line-error-3-manualName")).toBeVisible();
    await expect(dialog.getByTestId("purchase-line-name-2")).toHaveAttribute(
      "aria-invalid",
      "false",
    );
    await expect(dialog.getByTestId("purchase-line-name-2")).not.toHaveClass(/border-destructive/);
    await dialog.getByTestId("purchase-line-name-3").fill("Servicio aprobado");
    await expect(dialog.getByTestId("purchase-line-error-3-manualName")).toHaveCount(0);
    await dialog.getByTestId("purchase-line-quantity-2").fill("2");
    await dialog.getByTestId("purchase-line-cost-2").fill("20.00");
    await expect(dialog.getByTestId("purchase-line-name-2")).toHaveValue("Mesa gamer");

    await dialog.getByTestId("purchase-line-2").getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Producto vinculado" }).click();
    await dialog.getByRole("combobox", { name: "Producto 2" }).click();
    await page.getByRole("option", { name: new RegExp(linkedSecondName.data.name) }).click();
    await dialog.getByTestId("purchase-line-2").getByRole("combobox").first().click();
    await page.getByRole("option", { name: "No registrado" }).click();
    await dialog.getByRole("button", { name: "Confirmar compra" }).click();
    await expect(dialog.getByTestId("purchase-line-error-2-manualName")).toContainText("Línea 2:");

    await dialog
      .getByTestId("purchase-line-2")
      .getByRole("button", { name: "Quitar línea 2" })
      .click();
    await expect(dialog.getByTestId("purchase-line-error-2-manualName")).toHaveCount(0);
    await expect(dialog.getByTestId("purchase-line-name-2")).toHaveValue("Servicio aprobado");
    expect(
      await service.from("purchases").select("id").eq("invoice_no", `${invoiceNo}-LINE-ERRORS`),
    ).toMatchObject({ data: [], error: null });
  });

  test("posts manual first and linked Maquinita second with exact reported values", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const invoice = `${invoiceNo}-REPORTED-MIXED`;
    await page.goto("/purchases");
    await page.getByRole("button", { name: "Nueva compra" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Proveedor registrado" }).click();
    await page
      .getByRole("option", { name: new RegExp(`CHG35 browser supplier ${suffix}`) })
      .click();
    await dialog.locator("#purchase-invoice-number").fill(invoice);
    await dialog.locator("#purchase-description").fill("Compra de varios productos");

    await dialog.getByRole("combobox", { name: "Tipo de línea" }).first().click();
    await page.getByRole("option", { name: "No registrado" }).click();
    const manualName = dialog.getByTestId("purchase-line-name-1");
    await manualName.click();
    await manualName.press("Control+A");
    await manualName.pressSequentially("Mesa gamer ");
    await dialog.getByTestId("purchase-line-quantity-1").fill("1");
    await dialog.getByTestId("purchase-line-cost-1").fill("1000");

    await dialog.getByTestId("purchase-add-line").click();
    await dialog.getByRole("combobox", { name: "Tipo de línea" }).nth(1).click();
    await page.getByRole("option", { name: "Producto vinculado" }).click();
    await dialog.getByRole("combobox", { name: "Producto 2" }).click();
    await page.getByRole("option", { name: /GS-WM3Z95-.*Maquinita/ }).click();
    await dialog.getByTestId("purchase-line-quantity-2").fill("2");
    await dialog.getByTestId("purchase-line-cost-2").fill("800");

    let submittedRequest;
    let postRequestCount = 0;
    page.on("request", (request) => {
      if (request.url().includes("/rest/v1/rpc/post_purchase")) {
        postRequestCount += 1;
        submittedRequest = request.postDataJSON().p_request;
      }
    });
    await dialog.getByRole("button", { name: "Confirmar compra" }).click();
    const nameError = dialog.getByTestId("purchase-line-error-1-manualName");
    await expect(nameError).toContainText(
      "L\u00ednea 1: elimina los espacios al inicio o al final del nombre.",
    );
    await expect(manualName).toHaveAttribute("aria-invalid", "true");
    await expect(manualName).toBeFocused();
    await expect(dialog.getByTestId("purchase-line-error-2-manualName")).toHaveCount(0);
    expect(postRequestCount).toBe(0);

    await manualName.fill("");
    await expect(nameError).toContainText(
      "L\u00ednea 1: escribe el nombre del producto no registrado.",
    );
    await dialog.getByRole("button", { name: "Confirmar compra" }).click();
    await expect(manualName).toBeFocused();
    expect(postRequestCount).toBe(0);

    await manualName.fill(" Mesa gamer");
    await expect(nameError).toContainText(
      "L\u00ednea 1: elimina los espacios al inicio o al final del nombre.",
    );
    await dialog.getByRole("button", { name: "Confirmar compra" }).click();
    await expect(manualName).toBeFocused();
    expect(postRequestCount).toBe(0);

    await manualName.click();
    await manualName.press("Control+A");
    await manualName.pressSequentially("Mesa gamer");
    await expect(manualName).toHaveValue("Mesa gamer");
    await expect(nameError).toHaveCount(0);
    await expect(manualName).toHaveAttribute("aria-invalid", "false");
    await expect(
      dialog.getByLabel(/Actualizar inventario de los productos vinculados/),
    ).toBeChecked();
    await dialog.getByRole("button", { name: "Confirmar compra" }).click();

    const row = page.getByRole("row").filter({ hasText: invoice });
    await expect(row).toBeVisible({ timeout: 15_000 });
    expect(postRequestCount).toBe(1);
    expect(submittedRequest.description).toBe("Compra de varios productos");
    expect(submittedRequest.lines).toEqual([
      { item_id: null, name: "Mesa gamer", quantity: 1, unit_cost: "1000.00" },
      { item_id: reproductionItemId, quantity: 2, unit_cost: "800.00" },
    ]);
    const purchase = await service
      .from("purchases")
      .select("id,total")
      .eq("invoice_no", invoice)
      .single();
    if (purchase.error) throw purchase.error;
    expect(purchase.data.total).toBe(2600);
    const lines = await service
      .from("purchase_lines")
      .select("item_id,name_snapshot,quantity,unit_cost,subtotal,restocked")
      .eq("purchase_id", purchase.data.id)
      .order("line_number");
    if (lines.error) throw lines.error;
    expect(lines.data).toEqual([
      {
        item_id: null,
        name_snapshot: "Mesa gamer",
        quantity: 1,
        unit_cost: 1000,
        subtotal: 1000,
        restocked: false,
      },
      {
        item_id: reproductionItemId,
        name_snapshot: "Maquinita",
        quantity: 2,
        unit_cost: 800,
        subtotal: 1600,
        restocked: true,
      },
    ]);
    const stock = await service
      .from("inventory")
      .select("quantity")
      .eq("id", reproductionItemId)
      .single();
    if (stock.error) throw stock.error;
    expect(stock.data.quantity).toBe(2);
  });
});
