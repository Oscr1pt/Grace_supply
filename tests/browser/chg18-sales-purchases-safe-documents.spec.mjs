import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.CHG18_DISPOSABLE_TESTS === "1";
const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const container = process.env.LOCAL_SUPABASE_CONTAINER;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const admin = {
  username: `chg18-admin-${suffix}`,
  email: `chg18-admin-${suffix}@example.test`,
  password: `Documents-${crypto.randomUUID()}-9c!`,
};
const supplierName = `CHG18 proveedor ${suffix}`;
const sku = `CHG18-${suffix}`;
const invoiceNo = `CHG18-${suffix}`;
let service;
let adminId;
let supplierId;
let productId;
let originalStock;
let historicReceiptNo;

test.describe.serial("CHG-18 safe sales, purchases and documents", () => {
  test.skip(
    !enabled,
    "Financial browser tests run only against a verified disposable Supabase stack.",
  );

  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey || !container) {
      throw new Error("CHG-18 requires explicit disposable local Supabase metadata.");
    }
    const target = new URL(url);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) {
      throw new Error("CHG-18 refuses non-loopback Supabase URLs.");
    }
    if (!/^supabase_db_(?:chg18|chg10run)[a-z0-9]+$/.test(container)) {
      throw new Error("CHG-18 refuses a non-disposable database container.");
    }

    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const settings = await service.from("settings").select("tax_policy_approved").single();
    if (settings.error) throw settings.error;
    if (settings.data.tax_policy_approved !== false) {
      throw new Error("The disposable tax policy must remain unapproved for CHG-18.");
    }

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
      name: "Synthetic CHG-18 administrator",
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

    const supplier = await service
      .from("suppliers")
      .insert({ name: supplierName, status: "activo" })
      .select("id")
      .single();
    if (supplier.error) throw supplier.error;
    supplierId = supplier.data.id;

    const product = await service
      .from("inventory")
      .insert({
        kind: "product",
        sku,
        name: `CHG18 artículo ${suffix}`,
        category: "otro",
        cost_price: 10,
        price: 20,
        quantity: 0,
        is_active: true,
      })
      .select("id,quantity")
      .single();
    if (product.error) throw product.error;
    productId = product.data.id;
    originalStock = product.data.quantity;

    const client = await service
      .from("clients")
      .insert({ name: `CHG18 cliente ${suffix}`, status: "activo" })
      .select("id")
      .single();
    if (client.error) throw client.error;

    historicReceiptNo = `CHG18-HIST-${suffix}`;
    const historicalSale = await service
      .from("sales")
      .insert({
        receipt_no: historicReceiptNo,
        client_id: client.data.id,
        subtotal: 20,
        tax_rate: 0,
        tax: 0,
        total: 20,
        payment_type: "contado",
      })
      .select("id")
      .single();
    if (historicalSale.error) throw historicalSale.error;
    const historicalLine = await service.from("sale_lines").insert({
      sale_id: historicalSale.data.id,
      item_id: productId,
      sku,
      name: `CHG18 artículo histórico ${suffix}`,
      unit_price: 20,
      quantity: 1,
    });
    if (historicalLine.error) throw historicalLine.error;
    const changedPrice = await service.from("inventory").update({ price: 99 }).eq("id", productId);
    if (changedPrice.error) throw changedPrice.error;
  });

  async function login(page) {
    await page.goto("/login");
    const submit = page.getByRole("button", { name: "Entrar al sistema" });
    await expect(submit).toBeEnabled();
    await page.getByLabel("Usuario").fill(admin.username);
    await page.getByLabel("Contraseña").fill(admin.password);
    await expect(page.locator("#username")).toHaveValue(admin.username);
    await expect(page.locator("#password")).toHaveValue(admin.password);
    await submit.click();
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  }

  test("keeps sales blocked, preserves historic receipt snapshots, and supports keyboard and responsive use", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/sales");
    await expect(page.getByRole("alert").filter({ hasText: "Ventas bloqueadas" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ventas no disponibles" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Nueva venta" })).toHaveCount(0);

    const salesBefore = await service.from("sales").select("id");
    if (salesBefore.error) throw salesBefore.error;
    await expect(page.getByText(historicReceiptNo)).toBeVisible();
    await page.getByRole("button", { name: `Ver recibo ${historicReceiptNo}` }).click();
    const receipt = page.getByRole("dialog");
    await expect(receipt).toContainText("CHG18 artículo histórico");
    await expect(receipt).toContainText("RD$20.00");
    await expect(receipt).not.toContainText("RD$99.00");
    const salesAfter = await service.from("sales").select("id");
    if (salesAfter.error) throw salesAfter.error;
    expect(salesAfter.data).toHaveLength(salesBefore.data.length);

    await page.goto("/purchases");
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    }
    const trigger = page.getByRole("button", { name: "Nueva compra" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const dialogFits = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= document.documentElement.clientWidth;
    });
    expect(dialogFits).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("reconciles a committed purchase after a lost response and annuls it once with a reason", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/purchases");
    await page.getByRole("button", { name: "Nueva compra" }).click();
    const dialog = page.getByRole("dialog");
    const combos = dialog.getByRole("combobox");
    await combos.nth(0).click();
    await page.getByRole("option").filter({ hasText: supplierName }).click();
    await combos.nth(1).click();
    await page.getByRole("option", { name: /Crédito/ }).click();
    await dialog.getByLabel(/Factura Proveedor/).fill(invoiceNo);
    await combos.nth(2).click();
    await page.getByRole("option").filter({ hasText: sku }).click();
    await dialog.getByLabel("Descripción de la compra").fill(`Compra CHG18 ${suffix}`);
    await dialog.getByLabel("Cantidad").fill("2");
    await dialog.getByLabel("Costo unitario").fill("12.34");
    await dialog.getByLabel(/Sumar 2 unidad/).check();

    let postCalls = 0;
    await page.route("**/rest/v1/rpc/post_purchase", async (route) => {
      postCalls += 1;
      const response = await route.fetch();
      await response.body();
      await route.abort("failed");
    });
    await page.route("**/rest/v1/rpc/get_business_operation", (route) => route.abort("failed"));
    await dialog
      .getByRole("button", { name: "Confirmar compra" })
      .click({ clickCount: 2, delay: 10 });
    await expect(dialog.getByText(/No se recibió confirmación/)).toBeVisible();
    expect(postCalls).toBe(1);

    const pending = await page.evaluate(() => {
      const key = Object.keys(sessionStorage).find((candidate) =>
        candidate.startsWith("grace.pending-business-operation.v1:"),
      );
      return key ? JSON.parse(sessionStorage.getItem(key)) : null;
    });
    expect(pending.actorId).toBe(adminId);
    expect(pending.type).toBe("purchase");
    expect(pending.request.invoice_no).toBe(invoiceNo);
    expect(JSON.stringify(pending)).not.toMatch(
      /password|access[_-]?token|refresh[_-]?token|service[_-]?role|anon[_-]?key/i,
    );

    await page.reload();
    const recovered = page.getByRole("dialog");
    await expect(recovered).toBeVisible();
    await expect(recovered.getByLabel(/Factura Proveedor/)).toHaveValue(invoiceNo);
    await page.unroute("**/rest/v1/rpc/get_business_operation");
    await recovered.getByRole("button", { name: "Consultar operación" }).click();
    await expect(page.getByText("Compra reconciliada con el resultado persistido")).toBeVisible();

    const purchases = await service
      .from("purchases")
      .select("id,item_id,supplier_id,payment_type,quantity,unit_cost,total,voided_at")
      .eq("invoice_no", invoiceNo);
    if (purchases.error) throw purchases.error;
    expect(purchases.data).toHaveLength(1);
    const purchase = purchases.data[0];
    expect(purchase).toMatchObject({
      item_id: productId,
      supplier_id: supplierId,
      payment_type: "credito",
      quantity: 2,
      unit_cost: 12.34,
      total: 24.68,
      voided_at: null,
    });
    const credit = await service
      .from("supplier_credits")
      .select("balance,status")
      .eq("purchase_id", purchase.id)
      .single();
    if (credit.error) throw credit.error;
    expect(credit.data).toMatchObject({ balance: 24.68, status: "pendiente" });
    const stockAfterPost = await service
      .from("inventory")
      .select("quantity")
      .eq("id", productId)
      .single();
    if (stockAfterPost.error) throw stockAfterPost.error;
    expect(stockAfterPost.data.quantity).toBe(originalStock + 2);

    const row = page.locator("tr").filter({ hasText: invoiceNo });
    await expect(row).toBeVisible();
    const deleteRequests = [];
    page.on("request", (request) => {
      if (request.method() === "DELETE" && /\/(purchases|sales)(\?|$)/.test(request.url())) {
        deleteRequests.push(request.url());
      }
    });
    await row.getByRole("button", { name: `Anular compra ${invoiceNo}` }).click();
    const annulDialog = page.getByRole("dialog");
    await expect(annulDialog).toContainText(invoiceNo);
    const confirm = annulDialog.getByRole("button", { name: "Confirmar anulación" });
    await expect(confirm).toBeDisabled();
    await annulDialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(annulDialog).toHaveCount(0);
    expect(deleteRequests).toHaveLength(0);

    await row.getByRole("button", { name: `Anular compra ${invoiceNo}` }).click();
    const reopened = page.getByRole("dialog");
    await reopened.getByLabel("Motivo obligatorio").fill(`Corrección CHG18 ${suffix}`);
    let annulCalls = 0;
    await page.route("**/rest/v1/rpc/annul_financial_document", async (route) => {
      annulCalls += 1;
      const response = await route.fetch();
      await response.body();
      await route.abort("failed");
    });
    await page.route("**/rest/v1/rpc/get_business_operation", (route) => route.abort("failed"));
    await reopened
      .getByRole("button", { name: "Confirmar anulación" })
      .click({ clickCount: 2, delay: 10 });
    await expect(reopened.getByText(/No se confirmó la respuesta/)).toBeVisible();
    expect(annulCalls).toBe(1);
    const pendingAnnulment = await page.evaluate(() => {
      const key = Object.keys(sessionStorage).find((candidate) =>
        candidate.startsWith("grace.pending-business-operation.v1:"),
      );
      return key ? JSON.parse(sessionStorage.getItem(key)) : null;
    });
    expect(pendingAnnulment.type).toBe("financial_annulment");
    expect(pendingAnnulment.request.document_id).toBe(purchase.id);

    await page.reload();
    const recoveredAnnulment = page.getByRole("dialog");
    await expect(recoveredAnnulment).toBeVisible();
    await expect(recoveredAnnulment.getByLabel("Motivo obligatorio")).toHaveValue(
      `Corrección CHG18 ${suffix}`,
    );
    await page.unroute("**/rest/v1/rpc/get_business_operation");
    await recoveredAnnulment.getByRole("button", { name: "Consultar resultado" }).click();
    await expect(page.getByText("Anulación confirmada y reconciliada.")).toBeVisible();

    const annulled = await service
      .from("purchases")
      .select("voided_at,void_reason")
      .eq("id", purchase.id)
      .single();
    if (annulled.error) throw annulled.error;
    expect(annulled.data.voided_at).toBeTruthy();
    expect(annulled.data.void_reason).toBe(`Corrección CHG18 ${suffix}`);
    const finalStock = await service
      .from("inventory")
      .select("quantity")
      .eq("id", productId)
      .single();
    if (finalStock.error) throw finalStock.error;
    expect(finalStock.data.quantity).toBe(originalStock);
    expect(deleteRequests).toHaveLength(0);
  });

  test("records one quick cash purchase without creating or linking a supplier", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/purchases");
    await page.getByRole("button", { name: "Nueva compra" }).click();
    const dialog = page.getByRole("dialog");
    const quickMode = dialog.getByRole("radio", {
      name: "Compra rápida / Sin proveedor registrado",
    });
    await quickMode.focus();
    await page.keyboard.press("Space");
    await expect(quickMode).toBeChecked();
    await expect(dialog.getByText("Proveedor no identificado")).toBeVisible();
    await expect(dialog.locator("#purchase-supplier-name")).toHaveCount(0);

    let postCalls = 0;
    await page.route("**/rest/v1/rpc/post_purchase", async (route) => {
      postCalls += 1;
      await route.continue();
    });
    const paymentSelect = dialog.getByRole("combobox").nth(0);
    await paymentSelect.click();
    await page.getByRole("option", { name: /Crédito/ }).click();
    await dialog.getByRole("button", { name: "Confirmar compra" }).click();
    await expect(
      dialog.locator('[role="alert"]').filter({ hasText: /proveedor registrado y activo/i }),
    ).toBeVisible();
    expect(postCalls).toBe(0);

    await paymentSelect.click();
    await page.getByRole("option", { name: /Contado/ }).click();
    const invoice = `FIX02-${suffix}`;
    await dialog.getByLabel(/Factura Proveedor/).fill(invoice);
    const productSelect = dialog.getByRole("combobox").nth(1);
    await productSelect.click();
    await page.getByRole("option").filter({ hasText: sku }).click();
    await dialog.getByLabel("Descripción de la compra").fill(`Compra rápida FIX02 ${suffix}`);
    await dialog.getByLabel("Cantidad").fill("2");
    await dialog.getByLabel("Costo unitario").fill("8.25");
    await dialog.getByLabel(/Sumar 2 unidad/).check();

    const supplierCountBefore = await service
      .from("suppliers")
      .select("id", { count: "exact", head: true });
    if (supplierCountBefore.error) throw supplierCountBefore.error;
    await dialog
      .getByRole("button", { name: "Confirmar compra" })
      .click({ clickCount: 2, delay: 10 });
    await expect(dialog).toHaveCount(0);
    expect(postCalls).toBe(1);

    const purchases = await service
      .from("purchases")
      .select("id,supplier,supplier_id,item_id,payment_type,quantity,unit_cost,total")
      .eq("invoice_no", invoice);
    if (purchases.error) throw purchases.error;
    expect(purchases.data).toHaveLength(1);
    const purchase = purchases.data[0];
    expect(purchase).toMatchObject({
      supplier: "Proveedor no identificado",
      supplier_id: null,
      item_id: productId,
      payment_type: "contado",
      quantity: 2,
      unit_cost: 8.25,
      total: 16.5,
    });

    const supplierCountAfter = await service
      .from("suppliers")
      .select("id", { count: "exact", head: true });
    if (supplierCountAfter.error) throw supplierCountAfter.error;
    expect(supplierCountAfter.count).toBe(supplierCountBefore.count);
    const stock = await service.from("inventory").select("quantity").eq("id", productId).single();
    if (stock.error) throw stock.error;
    expect(stock.data.quantity).toBe(originalStock + 2);
    const credits = await service
      .from("supplier_credits")
      .select("id")
      .eq("purchase_id", purchase.id);
    if (credits.error) throw credits.error;
    expect(credits.data).toHaveLength(0);
  });
});
