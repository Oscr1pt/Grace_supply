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
  const weekAnchor = new Date(
    `${await page.getByLabel("Seleccionar semana").inputValue()}T00:00:00Z`,
  );
  const mondayOffset = (weekAnchor.getUTCDay() + 6) % 7;
  const weekStart = new Date(weekAnchor);
  weekStart.setUTCDate(weekStart.getUTCDate() - mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  await expect(page.getByTestId("report-period-range")).toContainText(
    String(weekStart.getUTCDate()),
  );
  await expect(page.getByTestId("report-period-range")).toContainText(String(weekEnd.getUTCDate()));

  await page.getByLabel("Tipo de período").selectOption("month");
  const monthInput = page.getByLabel("Seleccionar mes");
  await expect(monthInput).toHaveValue(/^\d{4}-\d{2}$/);
  const [monthYear, monthNumber] = (await monthInput.inputValue()).split("-").map(Number);
  const daysInMonth = new Date(monthYear, monthNumber, 0).getDate();
  await expect(page.getByTestId("report-period-range")).toContainText("1");
  await expect(page.getByTestId("report-period-range")).toContainText(String(daysInMonth));
  await expect(
    page.getByTestId("report-sales-expenses-chart").locator(".recharts-bar-rectangle"),
  ).toHaveCount(12);

  await page.getByLabel("Tipo de período").selectOption("year");
  const currentYear = await page.getByLabel("Seleccionar año").getAttribute("max");
  await expect(page.getByLabel("Seleccionar año")).toHaveValue(currentYear ?? "");
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
  await page.getByRole("button", { name: "Generar PDF" }).click();
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
  await expect(page.getByRole("button", { name: "Generar PDF" })).toBeDisabled();

  await page.getByRole("button", { name: "Preview: error" }).click();
  await expect(page.getByRole("alert")).toContainText(/no se pudo cargar/i);
  await expect(page.getByText("RD$ 0.00")).toHaveCount(0);

  await page.getByRole("button", { name: "Preview: denegado" }).click();
  await expect(page.getByRole("alert")).toContainText(/solo administradores/i);
  await expect(page.getByRole("button", { name: "Generar PDF" })).toBeDisabled();

  await page.getByRole("button", { name: "Preview: vacío" }).click();
  await expect(page.getByRole("status")).toContainText(/no hay movimientos/i);
  await expect(page.getByText("RD$ 0.00", { exact: true })).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Generar PDF" })).toBeEnabled();
  await expect(page.getByTestId("report-summary")).toContainText(
    /documentos anulados no se incluyen/i,
  );
});

test("invalid period edits hide previous results, block printing, and recover on valid input", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/reports-preview.html");
  await page.getByLabel("Tipo de período").selectOption("year");
  const year = page.getByLabel("Seleccionar año");
  const printButton = page.getByRole("button", { name: "Generar PDF" });
  const currentYear = Number(await year.getAttribute("max"));

  await expect(year).toHaveValue(String(currentYear));
  await expect(page.getByTestId("report-sales-expenses-chart")).toBeVisible();

  for (const partial of ["", "2", "20", "202", "20260"]) {
    await year.fill(partial);
    await expect(page.getByRole("alert")).toContainText(/año de cuatro dígitos/i);
    await expect(page.getByTestId("report-sales-expenses-chart")).toHaveCount(0);
    await expect(printButton).toBeDisabled();
  }

  await year.fill("1999");
  await expect(page.getByRole("alert")).toContainText("2000");
  await expect(page.getByTestId("report-metric-value")).toHaveCount(0);
  await year.fill(String(currentYear + 1));
  await expect(page.getByRole("alert")).toContainText(String(currentYear));

  await year.fill("202");
  await expect(printButton).toBeDisabled();
  await year.fill(String(currentYear));
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("report-sales-expenses-chart")).toBeVisible();
  await expect(printButton).toBeEnabled();

  await page.getByLabel("Tipo de período").selectOption("week");
  const week = page.getByLabel("Seleccionar semana");
  const validWeek = await week.inputValue();
  await week.fill("");
  await expect(page.getByRole("alert")).toContainText(/fecha válida/i);
  await expect(page.getByTestId("report-sales-expenses-chart")).toHaveCount(0);
  await week.fill(validWeek);
  await expect(page.getByTestId("report-sales-expenses-chart")).toBeVisible();

  await page.getByLabel("Tipo de período").selectOption("month");
  const month = page.getByLabel("Seleccionar mes");
  const validMonth = await month.inputValue();
  await expect(month).toHaveValue(/^\d{4}-\d{2}$/);
  await month.fill("");
  await expect(page.getByRole("alert")).toContainText(/mes y un año/i);
  await expect(page.getByTestId("report-sales-expenses-chart")).toHaveCount(0);
  await month.fill(validMonth);
  await expect(page.getByTestId("report-sales-expenses-chart")).toBeVisible();

  for (const type of ["year", "week", "month", "year"]) {
    await page.getByLabel("Tipo de período").selectOption(type);
    await expect(page.getByTestId("report-sales-expenses-chart")).toBeVisible();
    await expect(printButton).toBeEnabled();
  }
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
