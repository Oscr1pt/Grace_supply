import { expect, test } from "@playwright/test";

test("renders synthetic report, responsive charts, and matching print view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/tests/fixtures/reports-preview.html");

  await expect(page.getByTestId("synthetic-preview-notice")).toContainText("datos sintéticos");
  await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();
  await expect(page.getByText("RD$ 85,000.00", { exact: true })).toBeVisible();
  await expect(page.getByText("RD$ 18,000.00", { exact: true })).toBeVisible();
  await expect(page.getByTestId("report-sales-expenses-chart")).toBeVisible();
  await expect(page.getByTestId("report-expense-categories-chart")).toBeVisible();
  await expect(page.locator(".report-print-chart-card")).toHaveCount(2);
  await expect(
    page.getByTestId("report-sales-expenses-chart").locator(".recharts-bar-rectangle"),
  ).toHaveCount(14);
  await expect(
    page.getByTestId("report-sales-expenses-chart").getByText("Ventas sin ITBIS", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("report-sales-expenses-chart").getByText("Gastos operativos", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("report-expense-categories-chart").locator(".recharts-bar-rectangle"),
  ).toHaveCount(16);
  await expect(page.getByText("Sin ITBIS · ventas no anuladas", { exact: true })).toBeVisible();
  await expect(page.getByTestId("report-period-range")).toContainText("16");
  await expect(page.getByTestId("report-period-range")).toContainText("22");

  await page.getByLabel("Tipo de período").selectOption("month");
  await expect(page.getByLabel("Seleccionar mes")).toHaveValue("2026-11");
  await expect(page.getByTestId("report-period-range")).toContainText("1");
  await expect(page.getByTestId("report-period-range")).toContainText("30");
  await expect(
    page.getByTestId("report-sales-expenses-chart").locator(".recharts-bar-rectangle"),
  ).toHaveCount(12);

  await page.getByLabel("Tipo de período").selectOption("year");
  await expect(page.getByLabel("Seleccionar año")).toHaveValue("2026");
  await expect(page.getByTestId("report-sales-expenses-chart")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("report-expense-categories-chart")).toBeVisible();
  const categoryChartBox = await page.getByTestId("report-expense-categories-chart").boundingBox();
  expect(categoryChartBox?.height).toBeGreaterThanOrEqual(528);
  await expect(
    page.getByTestId("report-sales-expenses-chart").locator(".recharts-bar-rectangle"),
  ).toHaveCount(24);
  await expect(
    page.getByTestId("report-sales-expenses-chart").getByText("Ventas sin ITBIS", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("report-sales-expenses-chart").getByText("Gastos operativos", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("report-expense-categories-chart").locator(".recharts-bar-rectangle"),
  ).toHaveCount(16);
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    tallestSalesBar: Math.max(
      ...[
        ...document.querySelectorAll(
          '[data-testid="report-sales-expenses-chart"] .recharts-bar-rectangle',
        ),
      ]
        .slice(0, 12)
        .map((bar) => bar.getBoundingClientRect().height),
    ),
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.tallestSalesBar).toBeGreaterThan(100);

  await page.evaluate(() => {
    window.__printCount = 0;
    window.print = () => {
      window.__printCount += 1;
    };
  });
  await page.getByRole("button", { name: "Imprimir / Guardar PDF" }).click();
  expect(await page.evaluate(() => window.__printCount)).toBe(1);

  await page.emulateMedia({ media: "print" });
  for (const card of await page.locator(".report-print-chart-card").all()) {
    await expect(card).toHaveCSS("break-inside", "avoid");
  }
  await expect(page.getByTestId("reports-interactive-controls")).toHaveCSS("display", "none");
  await expect(page.getByTestId("preview-navigation")).toHaveCSS("display", "none");
  await expect(page.getByTestId("synthetic-preview-notice")).toHaveCSS("display", "none");
  await expect(page.getByTestId("reports-preview-controls")).toHaveCSS("display", "none");
  await expect(page.getByTestId("report-print-note")).toBeVisible();
  await expect(page.getByTestId("report-print-period").locator("..")).toContainText("Generado:");
  await expect(page.getByTestId("report-sales-expenses-chart")).toBeVisible();
  await expect(page.getByTestId("report-expense-categories-chart")).toBeVisible();
  await expect(page.getByTestId("report-summary")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reporte del negocio" })).toBeVisible();
  await expect(page.getByText("Grace Supply", { exact: true })).toBeVisible();
  const screenPeriod = (await page.getByTestId("report-period-range").innerText()).replace(
    "Período consultado: ",
    "",
  );
  await expect(page.getByTestId("report-print-period")).toHaveText(screenPeriod);
  await expect(page.getByText("RD$ 85,000.00", { exact: true })).toBeVisible();
  await expect(page.getByText("RD$ 18,000.00", { exact: true })).toBeVisible();
  await expect(page.getByText("RD$ 32,000.00", { exact: true })).toBeVisible();
  await expect(page.getByText("RD$ 15,300.00", { exact: true })).toBeVisible();
  await expect(page.getByTestId("report-summary")).toContainText("RD$ 85,000.00");
  await expect(
    page.getByTestId("report-sales-expenses-chart").locator(".recharts-bar-rectangle"),
  ).toHaveCount(24);
  await expect(
    page.getByTestId("report-expense-categories-chart").locator(".recharts-bar-rectangle"),
  ).toHaveCount(16);
  const screenshot = await page.screenshot();
  expect(screenshot.byteLength).toBeGreaterThan(0);
});

test("does not show zero values as a substitute for loading, failure, or denial", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/reports-preview.html");

  await page.getByRole("button", { name: "Preview: carga" }).click();
  await expect(page.getByRole("status")).toContainText(/cargando/i);
  await expect(page.getByText("RD$ 0.00")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Imprimir / Guardar PDF" })).toBeDisabled();

  await page.getByRole("button", { name: "Preview: error" }).click();
  await expect(page.getByRole("alert")).toContainText(/no se pudo cargar/i);
  await expect(page.getByText("RD$ 0.00")).toHaveCount(0);

  await page.getByRole("button", { name: "Preview: denegado" }).click();
  await expect(page.getByRole("alert")).toContainText(/solo administradores/i);
  await expect(page.getByRole("button", { name: "Imprimir / Guardar PDF" })).toBeDisabled();

  await page.getByRole("button", { name: "Preview: vacío" }).click();
  await expect(page.getByRole("status")).toContainText(/no hay movimientos/i);
  await expect(page.getByText("RD$ 0.00", { exact: true })).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Imprimir / Guardar PDF" })).toBeEnabled();
  await expect(page.getByTestId("report-summary")).toContainText(
    /documentos anulados no se incluyen/i,
  );
});

test("keeps report filters, period range, and print action separated across viewport widths", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/reports-preview.html");

  for (const width of [1440, 1024, 900, 768, 640, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const root = document.documentElement;
      const section = document.querySelector('[data-testid="reports-interactive-controls"]');
      const button = section?.querySelector("button");
      const range = section?.querySelector('[data-testid="report-period-range"]');
      const filter = section?.querySelector("#report-period-type");
      const anchor = section?.querySelector("#report-period-anchor");
      if (!section || !button || !range || !filter || !anchor) {
        throw new Error("Report controls missing");
      }

      const rect = (element) => {
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return { left, right, top, bottom };
      };
      const overlaps = (a, b) =>
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

      const buttonRect = rect(button);
      const rangeRect = rect(range);
      const filterRect = rect(filter);
      const anchorRect = rect(anchor);
      const sectionRect = rect(section);
      return {
        viewport: root.clientWidth,
        document: root.scrollWidth,
        buttonOverlapsFilter: overlaps(buttonRect, filterRect),
        buttonOverlapsAnchor: overlaps(buttonRect, anchorRect),
        buttonOverlapsPeriod: overlaps(buttonRect, rangeRect),
        buttonInsideSection:
          buttonRect.left >= sectionRect.left && buttonRect.right <= sectionRect.right,
        rects: { sectionRect, buttonRect, rangeRect, filterRect, anchorRect },
      };
    });

    expect(layout.document, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(
      layout.viewport,
    );
    expect(
      layout.buttonOverlapsFilter,
      `button overlaps filters at ${width}px: ${JSON.stringify(layout.rects)}`,
    ).toBe(false);
    expect(layout.buttonOverlapsAnchor, `button overlaps period selector at ${width}px`).toBe(
      false,
    );
    expect(layout.buttonOverlapsPeriod, `button overlaps period text at ${width}px`).toBe(false);
    expect(layout.buttonInsideSection, `button is clipped at ${width}px`).toBe(true);
  }
});
