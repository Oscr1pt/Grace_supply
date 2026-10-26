import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const username = `chg13-${suffix}`;
const email = `chg13-${suffix}@example.test`;
const password = `Catalog-${crypto.randomUUID()}-9c!`;
const employee = {
  username: `chg13-employee-${suffix}`,
  email: `chg13-employee-${suffix}@example.test`,
  password: `Employee-${crypto.randomUUID()}-9c!`,
};
let service;
let identityId;
let employeeIdentityId;
let productSku;
let productId;
const disposableRun = process.env.CHG13_DISPOSABLE_TESTS === "1";

test.describe.serial("CHG-13 catalog experience", () => {
  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey)
      throw new Error("Local Supabase test environment is required");
    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    identityId = created.data.user.id;
    const profile = await service.from("user_profiles").insert({
      auth_user_id: identityId,
      username,
      name: "Synthetic CHG-13 catalog user",
      role: "admin",
      permissions: ["dashboard", "inventory", "sales", "purchases", "settings"],
      active: true,
    });
    if (profile.error) throw profile.error;

    const employeeUser = await service.auth.admin.createUser({
      email: employee.email,
      password: employee.password,
      email_confirm: true,
    });
    if (employeeUser.error) throw employeeUser.error;
    employeeIdentityId = employeeUser.data.user.id;
    const employeeProfile = await service.from("user_profiles").insert({
      auth_user_id: employeeIdentityId,
      username: employee.username,
      name: "Synthetic CHG-13 inventory employee",
      role: "employee",
      permissions: ["dashboard", "inventory"],
      active: true,
    });
    if (employeeProfile.error) throw employeeProfile.error;
  });

  test.afterAll(async () => {
    if (!service || !identityId) return;
    if (!disposableRun) {
      if (employeeIdentityId) await service.auth.admin.deleteUser(employeeIdentityId);
      await service.auth.admin.deleteUser(identityId);
    }
  });

  async function login(page, credentials = { username, password }) {
    await page.addInitScript(() => {
      window.print = () => {};
    });
    await page.goto("/login");
    const submit = page.getByRole("button", { name: "Entrar al sistema" });
    await expect(submit).toBeEnabled();
    await page.locator("#username").fill(credentials.username);
    await page.locator("#password").fill(credentials.password);
    await expect(page.locator("#username")).toHaveValue(credentials.username);
    await expect(page.locator("#password")).toHaveValue(credentials.password);
    await submit.click();
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  }

  async function currentActor(page) {
    const accessToken = await page.evaluate(() => {
      for (let index = 0; index < sessionStorage.length; index += 1) {
        const value = sessionStorage.getItem(sessionStorage.key(index));
        try {
          const session = JSON.parse(value);
          if (session?.access_token) return session.access_token;
        } catch {
          /* Ignore unrelated session storage entries. */
        }
      }
      return null;
    });
    if (!accessToken) throw new Error("The authenticated browser session token is unavailable");
    return createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }

  test("creates, edits, searches, and prints a generic product", async ({ page }) => {
    let lastInventoryPatch;
    if (!disposableRun) {
      let catalogRow;
      await page.route("**/rest/v1/inventory**", async (route) => {
        const request = route.request();
        if (!["POST", "PATCH"].includes(request.method())) return route.continue();
        const payload = request.postDataJSON();
        if (request.method() === "PATCH") lastInventoryPatch = payload;
        catalogRow = {
          id: payload.id ?? catalogRow?.id ?? crypto.randomUUID(),
          kind: "product",
          sku: payload.sku ?? catalogRow?.sku,
          name: payload.name ?? catalogRow?.name,
          description: payload.description ?? catalogRow?.description ?? "",
          category: payload.category ?? catalogRow?.category,
          brand: payload.brand ?? catalogRow?.brand ?? null,
          presentation: payload.presentation ?? catalogRow?.presentation ?? null,
          unit: payload.unit ?? catalogRow?.unit ?? null,
          attributes: payload.attributes ?? catalogRow?.attributes ?? {},
          is_active: payload.is_active ?? catalogRow?.is_active ?? true,
          cost_price: payload.cost_price ?? catalogRow?.cost_price ?? 0,
          price: payload.price ?? catalogRow?.price ?? 0,
          quantity: payload.quantity ?? catalogRow?.quantity ?? 0,
          created_at: catalogRow?.created_at ?? new Date().toISOString(),
        };
        await route.fulfill({
          status: request.method() === "POST" ? 201 : 200,
          contentType: "application/json",
          headers: { "content-range": "0-0/1" },
          body: JSON.stringify([catalogRow]),
        });
      });
    }
    await login(page);
    await page.goto("/inventory");
    await expect(page.getByRole("heading", { name: "Inventario de Productos" })).toBeVisible();
    if (disposableRun)
      await expect(
        page.getByText("Aún no hay productos. Registra el primero para comenzar."),
      ).toBeVisible();

    await page.getByRole("button", { name: "Nuevo producto" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Costo de compra")).toBeEnabled();
    await expect(dialog.getByLabel("Precio de venta")).toBeEnabled();
    await dialog.getByPlaceholder("Nombre del producto").fill(`Cera mate ${suffix}`);
    productSku = `CHG13-${suffix}`;
    await dialog.getByTestId("catalog-sku").fill(productSku);
    await dialog.getByTestId("catalog-category").fill(`Peinado ${suffix}`);
    await dialog.getByTestId("catalog-brand").fill("Grace Supply");
    await dialog.getByTestId("catalog-presentation").fill("100 g");
    await dialog.getByTestId("catalog-unit").fill("tarro");
    await dialog.getByLabel("Costo de compra").fill("12.50");
    await dialog.getByLabel("Precio de venta").fill("45.50");
    await expect(dialog.getByTestId("catalog-category")).toHaveValue(`Peinado ${suffix}`);
    await dialog.getByRole("button", { name: "Agregar producto" }).click();
    await expect(page.getByText("Producto agregado")).toBeVisible();
    const row = page.locator("tr").filter({ hasText: productSku });
    await expect(row).toContainText(`Cera mate ${suffix}`);
    if (disposableRun) {
      const saved = await service.from("inventory").select("id").eq("sku", productSku).single();
      if (saved.error) throw saved.error;
      productId = saved.data.id;
    }

    await row.getByRole("button", { name: `Editar Cera mate ${suffix}` }).click();
    const editDialog = page.getByRole("dialog");
    await editDialog.getByTestId("catalog-category").fill(`Accesorios ${suffix}`);
    await editDialog.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Producto actualizado")).toBeVisible();
    if (disposableRun) {
      const persistedEdit = await service
        .from("inventory")
        .select("category,quantity")
        .eq("id", productId)
        .single();
      expect(persistedEdit.data).toEqual({ category: `Accesorios ${suffix}`, quantity: 0 });
      await page.reload();
      await expect(page.locator("tr").filter({ hasText: productSku })).toContainText(
        `Accesorios ${suffix}`,
      );
    } else {
      expect(lastInventoryPatch).not.toHaveProperty("quantity");
    }

    await row.getByRole("button", { name: `Desactivar Cera mate ${suffix}` }).click();
    await expect(page.getByText("Producto desactivado")).toBeVisible();
    if (disposableRun) {
      const actor = await currentActor(page);
      const hiddenProduct = await actor
        .from("sales_inventory_lookup")
        .select("id")
        .eq("id", productId);
      expect(hiddenProduct.data).toEqual([]);
    }
    await row.getByRole("button", { name: `Activar Cera mate ${suffix}` }).click();
    await expect(page.getByText("Producto activado")).toBeVisible();

    const search = page.getByPlaceholder(
      "Buscar por SKU, nombre, categoría, marca o presentación…",
    );
    await search.fill(`Accesorios ${suffix}`);
    await expect(page.locator("tr").filter({ hasText: productSku })).toBeVisible();
    await search.fill("sin-resultados-chg13");
    await expect(page.getByText("No hay productos que coincidan con la búsqueda.")).toBeVisible();
    await search.fill(productSku);
    await page
      .locator("tr")
      .filter({ hasText: productSku })
      .getByRole("button", { name: `Código de barras para Cera mate ${suffix}` })
      .click();
    const labelDialog = page.getByRole("dialog");
    await expect(labelDialog.getByText(`Cera mate ${suffix}`)).toBeVisible();
    const generatedLabel = await labelDialog.locator("#barcode-print").innerText();
    expect(generatedLabel).not.toMatch(/\b(ct|quilate|gema|piedra|metal|oro)\b/i);
    await expect(labelDialog.locator("#barcode-print")).toContainText("45.50");
    await labelDialog.locator("#label-price").click();
    await expect(labelDialog.getByText("Ajuste de etiqueta confirmado.")).toBeVisible();
    await expect(labelDialog.locator("#barcode-print")).not.toContainText("45.50");
    await labelDialog.locator("#label-price").click();
    await expect(labelDialog.getByText("Ajuste de etiqueta confirmado.")).toBeVisible();
    await expect(labelDialog.locator("#barcode-print")).toContainText("45.50");
    await labelDialog.getByRole("button", { name: "Imprimir" }).click();
  });

  test("keeps the product form open and its values after a persistence rejection", async ({
    page,
  }) => {
    let writes = 0;
    await page.route("**/rest/v1/inventory**", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      writes += 1;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          code: "23505",
          message: "duplicate key value violates unique constraint",
          details: null,
          hint: null,
        }),
      });
    });
    await login(page);
    await page.goto("/inventory");
    await page.getByRole("button", { name: "Nuevo producto" }).click();
    const dialog = page.getByRole("dialog");
    const name = `Producto rechazado ${suffix}`;
    await dialog.getByPlaceholder("Nombre del producto").fill(name);
    await dialog.getByTestId("catalog-category").fill("Prueba");
    await dialog.getByRole("button", { name: "Agregar producto" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder("Nombre del producto")).toHaveValue(name);
    await expect(dialog.getByText("Este SKU ya existe. Usa otro código.")).toBeVisible();
    await expect(page.getByText("Producto agregado")).toHaveCount(0);
    expect(writes).toBe(1);
  });

  test("shows field-level errors for required fields, invalid money, and malformed optional attributes", async ({
    page,
  }) => {
    let writes = 0;
    await page.route("**/rest/v1/inventory**", async (route) => {
      if (["POST", "PATCH"].includes(route.request().method())) writes += 1;
      await route.continue();
    });
    await login(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/inventory");
    await expect(page.getByRole("heading", { name: "Inventario de Productos" })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole("button", { name: "Nuevo producto" }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("catalog-category")).toHaveAttribute(
      "list",
      "inventory-categories",
    );
    await dialog.getByTestId("catalog-sku").fill(" ");
    await dialog.getByPlaceholder("Nombre del producto").fill("   ");
    await dialog.getByTestId("catalog-category").fill(" ");
    await dialog.getByLabel("Costo de compra").fill("-2");
    await dialog.getByLabel("Precio de venta").fill("12.345");
    await dialog.getByText("Atributos adicionales (opcional)").click();
    await dialog.getByTestId("catalog-attributes").fill("{");
    await dialog.getByRole("button", { name: "Agregar producto" }).click();
    await expect(dialog.getByText("Escribe un SKU para identificar el producto.")).toBeVisible();
    await expect(dialog.getByText("Escribe el nombre del producto.")).toBeVisible();
    await expect(dialog.getByText("Elige o escribe una categoría.")).toBeVisible();
    await expect(
      dialog.getByText("Usa un importe igual o mayor que cero, con hasta 2 decimales."),
    ).toHaveCount(2);
    await expect(dialog.getByText("Revisa las comillas y separadores del JSON.")).toBeVisible();
    await expect(dialog.getByTestId("catalog-sku")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog).toBeVisible();
    expect(writes).toBe(0);
  });

  test("keeps cost and price controls protected for inventory employees", async ({ page }) => {
    await login(page, employee);
    await page.goto("/inventory");
    await page.getByRole("button", { name: "Nuevo producto" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Costo de compra")).toBeDisabled();
    await expect(dialog.getByLabel("Precio de venta")).toBeDisabled();
    await expect(dialog.getByLabel("Existencia (Stock)")).toBeDisabled();
    await expect(
      dialog.getByText("El stock se actualiza al registrar una compra o venta autorizada."),
    ).toBeVisible();
  });

  test("offers the same UUID catalog item in sales and purchase selectors with price and stock context", async ({
    page,
  }) => {
    if (disposableRun) {
      if (!productId || !productSku)
        throw new Error("The catalog CRUD test must create the disposable product first");
      await login(page);
      const actor = await currentActor(page);
      const purchase = await actor.rpc("post_purchase", {
        p_request: {
          idempotency_key: crypto.randomUUID(),
          supplier_name: `CHG13 supplier ${suffix}`,
          item_id: productId,
          description: `Restock ${productSku}`,
          quantity: 1,
          unit_cost: "12.50",
          restock: true,
          payment_type: "contado",
        },
      });
      if (purchase.error) throw purchase.error;
      const stocked = await service
        .from("inventory")
        .select("quantity,price")
        .eq("id", productId)
        .single();
      if (stocked.error) throw stocked.error;
      expect(stocked.data).toEqual({ quantity: 1, price: 45.5 });

      await page.goto("/sales");
      await page.getByRole("button", { name: "Nueva venta" }).click();
      const saleDialog = page.getByRole("dialog");
      await saleDialog.getByRole("combobox").nth(2).click();
      await page.getByRole("option", { name: new RegExp(productSku) }).click();
      await saleDialog.getByRole("button", { name: "Agregar" }).click();
      await expect(saleDialog.getByText(`Cera mate ${suffix}`)).toBeVisible();
      const quantity = saleDialog.getByRole("spinbutton", {
        name: `Cantidad de Cera mate ${suffix}`,
      });
      await quantity.fill("2");
      await expect(quantity).toHaveValue("1");
      await expect(
        page.getByText("La cantidad no puede superar la existencia disponible"),
      ).toBeVisible();

      await page.goto("/purchases");
      await page.getByRole("button", { name: "Nueva compra" }).click();
      const purchaseDialog = page.getByRole("dialog");
      await purchaseDialog.getByRole("combobox").nth(2).click();
      const option = page.getByRole("option", { name: new RegExp(`${productSku}.*Stock 1`) });
      await expect(option).toBeVisible();
      await expect(option).toContainText("45.50");
      await option.click();
      await expect(purchaseDialog.getByRole("checkbox")).toBeVisible();
      await page.goto("/inventory");
      const productRow = page.locator("tr").filter({ hasText: productSku });
      await productRow.getByRole("button", { name: `Desactivar Cera mate ${suffix}` }).click();
      await expect(page.getByText("Producto desactivado")).toBeVisible();
      const history = await service.from("purchases").select("id").eq("item_id", productId);
      expect(history.data).toHaveLength(1);
      const inactiveProduct = await service
        .from("inventory")
        .select("is_active")
        .eq("id", productId)
        .single();
      expect(inactiveProduct.data.is_active).toBe(false);
      const actorAfterDeactivation = await currentActor(page);
      const unavailableForSale = await actorAfterDeactivation
        .from("sales_inventory_lookup")
        .select("id")
        .eq("id", productId);
      expect(unavailableForSale.data).toEqual([]);
      await productRow.getByRole("button", { name: `Activar Cera mate ${suffix}` }).click();
      await expect(page.getByText("Producto activado")).toBeVisible();
      return;
    }

    const product = {
      id: "6c166b0f-5714-4da4-b376-9a2aa78683f1",
      sku: `CHG13-PICK-${suffix}`,
      name: `Peine profesional ${suffix}`,
      price: 45.5,
      quantity: 1,
    };
    await page.route("**/rest/v1/sales_inventory_lookup**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": "0-0/1" },
        body: JSON.stringify([product]),
      }),
    );
    await login(page);
    await page.goto("/sales");
    await page.getByRole("button", { name: "Nueva venta" }).click();
    const saleDialog = page.getByRole("dialog");
    await saleDialog.getByRole("combobox").nth(2).click();
    await page.getByRole("option", { name: new RegExp(product.sku) }).click();
    await saleDialog.getByRole("button", { name: "Agregar" }).click();
    await expect(saleDialog.getByText(product.name)).toBeVisible();
    await saleDialog.getByRole("combobox").nth(2).click();
    await page.getByRole("option", { name: new RegExp(product.sku) }).click();
    await saleDialog.getByRole("button", { name: "Agregar" }).click();
    await expect(page.getByText("La cantidad supera la existencia disponible")).toBeVisible();
    await page.goto("/purchases");
    await page.getByRole("button", { name: "Nueva compra" }).click();
    const purchaseDialog = page.getByRole("dialog");
    await purchaseDialog.getByRole("combobox").nth(2).click();
    const option = page.getByRole("option", { name: new RegExp(`${product.sku}.*Stock 1`) });
    await expect(option).toBeVisible();
    await expect(option).toContainText("45.50");
    await option.click();
    await expect(purchaseDialog.getByRole("checkbox")).toBeVisible();
  });
});
