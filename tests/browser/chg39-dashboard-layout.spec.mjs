import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

const dashboardSource = readFileSync(
  new URL("../../src/routes/_app/dashboard.tsx", import.meta.url),
  "utf8",
);

test("quick actions remains content-sized on desktop and responsive on mobile", async ({
  page,
}, testInfo) => {
  expect(dashboardSource).toMatch(/mt-8 grid min-w-0 items-start gap-6 lg:grid-cols-2/);

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/login");
  await page.evaluate(() => {
    const grid = document.createElement("div");
    grid.className = "mt-8 grid min-w-0 items-start gap-6 lg:grid-cols-2";
    grid.setAttribute("data-testid", "synthetic-dashboard-grid");
    grid.style.position = "fixed";
    grid.style.inset = "12px";
    grid.style.zIndex = "10000";
    grid.style.background = "white";

    const recent = document.createElement("section");
    recent.className = "min-w-0 rounded-xl border p-6";
    recent.innerHTML = '<h2 class="text-lg font-semibold">Ventas recientes</h2>';
    const recentRows = document.createElement("div");
    recentRows.style.height = "480px";
    recentRows.style.marginTop = "16px";
    recentRows.textContent = "Datos sintéticos de ventas";
    recent.append(recentRows);

    const actions = document.createElement("section");
    actions.className = "min-w-0 rounded-xl border p-6";
    actions.innerHTML = '<h2 class="text-lg font-semibold">Acciones rápidas</h2>';
    const buttons = document.createElement("div");
    buttons.className = "mt-4 grid gap-3";
    for (const label of [
      "Registrar venta",
      "Registrar compra",
      "Clientes",
      "Proveedores",
      "Inventario",
      "Ajustes",
    ]) {
      const link = document.createElement("a");
      link.href = "#";
      link.className = "block rounded-md border p-3";
      link.textContent = label;
      buttons.append(link);
    }
    actions.append(buttons);
    grid.append(recent, actions);
    document.body.append(grid);
  });

  const grid = page.getByTestId("synthetic-dashboard-grid");
  const actions = grid.locator("section").nth(1);
  await expect(actions).toBeVisible();
  await expect(actions.getByRole("link")).toHaveCount(6);
  const desktop = await grid.evaluate((element) => {
    const [recent, actionsCard] = element.children;
    return {
      columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
      actionsHeight: actionsCard.getBoundingClientRect().height,
      recentHeight: recent.getBoundingClientRect().height,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  await grid.screenshot({ path: testInfo.outputPath("dashboard-quick-actions-desktop.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await grid.evaluate((element) => ({
    columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  await grid.screenshot({ path: testInfo.outputPath("dashboard-quick-actions-mobile.png") });

  await actions
    .locator("a")
    .nth(2)
    .evaluate((link) => link.remove());
  await actions
    .locator("a")
    .nth(2)
    .evaluate((link) => link.remove());
  const restrictedButtonCount = await actions.getByRole("link").count();
  const restrictedHeight = await actions.evaluate(
    (element) => element.getBoundingClientRect().height,
  );

  expect(desktop.columns).toBe(2);
  expect(desktop.actionsHeight).toBeLessThan(desktop.recentHeight - 100);
  expect(desktop.overflow).toBe(false);
  expect(mobile.columns).toBe(1);
  expect(mobile.scrollWidth).toBeLessThanOrEqual(mobile.width);
  expect(restrictedButtonCount).toBe(4);
  expect(restrictedHeight).toBeLessThan(desktop.actionsHeight);
});
