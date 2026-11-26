import { expect, test } from "@playwright/test";

test("searches accent-insensitively, selects by keyboard, clears, and stays inside a dialog", async ({
  page,
}) => {
  const nonLocalRequests = [];
  page.on("request", (request) => {
    const { hostname } = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(hostname)) nonLocalRequests.push(hostname);
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tests/fixtures/searchable-select-preview.html");
  await page.getByRole("button", { name: "Abrir formulario" }).click();

  const clientSelector = page.getByTestId("client-selector");
  await clientSelector.press("Enter");
  const clientSearch = page.getByPlaceholder("Buscar cliente por nombre, teléfono o ID…");
  await clientSearch.fill("jose nunez");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("selected-client-id")).toHaveText("client-100");

  const supplierSelector = page.getByTestId("supplier-selector");
  await supplierSelector.click();
  const supplierSearch = page.getByPlaceholder("Buscar proveedor por nombre, RNC o ID…");
  await supplierSearch.fill("101-02030");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.getByRole("option").click();
  await expect(page.getByTestId("selected-supplier-id")).toHaveText("supplier-100");

  const selector = page.getByTestId("product-selector");
  await selector.press("Enter");
  const search = page.getByPlaceholder("Buscar por nombre, SKU o código…");
  await expect(search).toBeFocused();
  await search.fill("CAFE");
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("selected-product-id")).toHaveText("product-cafe");
  await expect(selector).toContainText("CAF-02 — Café molido");

  await selector.press("Enter");
  await search.fill("no existe");
  await expect(page.getByText("No se encontraron productos.")).toBeVisible();
  await page.getByRole("button", { name: "Limpiar búsqueda" }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("option")).toHaveCount(3);
  await expect(page.getByTestId("selected-product-id")).toHaveText("product-cafe");

  const mobileBounds = await page.getByRole("listbox").boundingBox();
  expect(mobileBounds).not.toBeNull();
  expect(mobileBounds.x).toBeGreaterThanOrEqual(0);
  expect(mobileBounds.x + mobileBounds.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(nonLocalRequests).toEqual([]);
});

test("filters a product by SKU and preserves disabled stock options", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/tests/fixtures/searchable-select-preview.html");
  await page.getByRole("button", { name: "Abrir formulario" }).click();
  const selector = page.getByTestId("product-selector");
  await selector.press("Enter");
  const search = page.getByPlaceholder("Buscar por nombre, SKU o código…");
  await search.fill("caf-03");
  const option = page.getByRole("option");
  await expect(option).toHaveCount(1);
  await expect(option).toHaveAttribute("aria-disabled", "true");
  await expect(option).toContainText("Café descafeinado");
  const desktopBounds = await page.getByRole("listbox").boundingBox();
  expect(desktopBounds).not.toBeNull();
  expect(desktopBounds.x).toBeGreaterThanOrEqual(0);
  expect(desktopBounds.x + desktopBounds.width).toBeLessThanOrEqual(1280);
  await page.getByRole("button", { name: "Limpiar búsqueda" }).click();
  await search.fill("te-01");
  await page.getByRole("option").click();
  await expect(page.getByTestId("selected-product-id")).toHaveText("product-te");
});
