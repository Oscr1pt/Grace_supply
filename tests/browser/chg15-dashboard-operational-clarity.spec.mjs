import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const admin = {
  username: `chg15-admin-${suffix}`,
  email: `chg15-admin-${suffix}@example.test`,
  password: `Dashboard-${crypto.randomUUID()}-9c!`,
};
const employee = {
  username: `chg15-employee-${suffix}`,
  email: `chg15-employee-${suffix}@example.test`,
  password: `Dashboard-${crypto.randomUUID()}-9c!`,
};
const fixtureIds = { clients: [], inventory: [], sales: [], expenses: [], purchases: [] };
const skus = { active: `CHG15-A-${suffix}`, inactive: `CHG15-I-${suffix}` };
let service;
let adminActor;
let adminId;
let employeeId;
let adminSettings;
let expectedDashboardInventoryValue = 60;
let expectedDashboardActiveItems = 1;
let expectedDashboardInactiveItems = 1;

test.describe.serial("CHG-15 dashboard operational clarity", () => {
  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey) {
      throw new Error("Disposable local Supabase is required for CHG-15 browser tests");
    }
    if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(url).hostname)) {
      throw new Error("CHG-15 browser tests refuse non-local Supabase URLs");
    }

    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const settings = await service.from("settings").select("*").single();
    if (settings.error) throw settings.error;
    adminSettings = settings.data;
    if (adminSettings.tax_policy_approved !== false) {
      throw new Error("The disposable tax policy must start unapproved");
    }

    const adminAuth = await service.auth.admin.createUser({
      email: admin.email,
      password: admin.password,
      email_confirm: true,
    });
    if (adminAuth.error) throw adminAuth.error;
    adminId = adminAuth.data.user.id;
    const adminProfile = await service.from("user_profiles").insert({
      auth_user_id: adminId,
      username: admin.username,
      name: "Synthetic CHG-15 dashboard administrator",
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
    adminActor = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminSession = await adminActor.auth.signInWithPassword({
      email: admin.email,
      password: admin.password,
    });
    if (adminSession.error) throw adminSession.error;

    const employeeAuth = await service.auth.admin.createUser({
      email: employee.email,
      password: employee.password,
      email_confirm: true,
    });
    if (employeeAuth.error) throw employeeAuth.error;
    employeeId = employeeAuth.data.user.id;
    const employeeProfile = await service.from("user_profiles").insert({
      auth_user_id: employeeId,
      username: employee.username,
      name: "Synthetic CHG-15 inventory employee",
      role: "employee",
      permissions: ["dashboard", "inventory"],
      active: true,
    });
    if (employeeProfile.error) throw employeeProfile.error;
  });

  test.afterAll(async () => {
    if (!service) return;
    for (const table of ["expenses", "sales", "purchases", "inventory", "clients"]) {
      const ids = fixtureIds[table];
      if (ids.length) await service.from(table).delete().in("id", ids);
    }
    if (employeeId) await service.auth.admin.deleteUser(employeeId);
    if (adminId) await service.auth.admin.deleteUser(adminId);
  });

  async function login(page, user = admin) {
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

  function businessToday() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santo_Domingo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  async function seedDashboardData() {
    const today = businessToday();
    const [year, month] = today.split("-").map(Number);
    const previousMonthDay = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
    const todayAtNoonUtc = new Date(`${today}T16:00:00.000Z`).toISOString();
    const voidedAt = new Date(`${today}T17:00:00.000Z`).toISOString();
    const clients = await service
      .from("clients")
      .insert([
        { name: `CHG15 active client ${suffix}`, status: "activo" },
        { name: `CHG15 inactive client ${suffix}`, status: "inactivo" },
      ])
      .select("id,status");
    if (clients.error) throw clients.error;
    fixtureIds.clients.push(...clients.data.map((row) => row.id));
    const activeClient = clients.data.find((row) => row.status === "activo");

    const products = await service
      .from("inventory")
      .insert([
        {
          kind: "product",
          sku: skus.active,
          name: "CHG15 active item",
          category: "otro",
          cost_price: 9999,
          price: 20,
          quantity: 0,
          is_active: true,
        },
        {
          kind: "product",
          sku: skus.inactive,
          name: "CHG15 inactive item",
          category: "otro",
          cost_price: 8888,
          price: 500,
          quantity: 0,
          is_active: true,
        },
      ])
      .select("id,sku");
    if (products.error) throw products.error;
    fixtureIds.inventory.push(...products.data.map((row) => row.id));
    for (const [index, product] of products.data.entries()) {
      const purchase = await adminActor.rpc("post_purchase", {
        p_request: {
          idempotency_key: crypto.randomUUID(),
          item_id: product.id,
          description: `CHG15 dashboard fixture restock ${index}`,
          quantity: index === 0 ? 3 : 4,
          unit_cost: index === 0 ? "9999.00" : "8888.00",
          restock: true,
          payment_type: "contado",
          supplier_name: `CHG15 synthetic supplier ${suffix}`,
        },
      });
      if (purchase.error) throw purchase.error;
      fixtureIds.purchases.push(purchase.data.purchase_id);
    }
    const deactivated = await service
      .from("inventory")
      .update({ is_active: false })
      .eq("id", products.data[1].id);
    if (deactivated.error) throw deactivated.error;

    const sales = await service
      .from("sales")
      .insert([
        {
          receipt_no: `CHG15-CASH-${suffix}`,
          client_id: activeClient.id,
          subtotal: 60,
          tax_rate: 0,
          tax: 0,
          total: 60,
          payment_type: "contado",
          created_at: todayAtNoonUtc,
        },
        {
          receipt_no: `CHG15-CREDIT-${suffix}`,
          client_id: activeClient.id,
          subtotal: 100,
          tax_rate: 0,
          tax: 0,
          total: 100,
          payment_type: "credito",
          created_at: todayAtNoonUtc,
        },
        {
          receipt_no: `CHG15-UNKNOWN-${suffix}`,
          client_id: activeClient.id,
          subtotal: 70,
          tax_rate: 0,
          tax: 0,
          total: 70,
          payment_type: null,
          created_at: todayAtNoonUtc,
        },
        {
          receipt_no: `CHG15-VOID-${suffix}`,
          client_id: activeClient.id,
          subtotal: 999,
          tax_rate: 0,
          tax: 0,
          total: 999,
          payment_type: "contado",
          created_at: todayAtNoonUtc,
          voided_at: voidedAt,
          void_reason: "Local dashboard fixture",
        },
        {
          receipt_no: `CHG15-PRIOR-${suffix}`,
          client_id: activeClient.id,
          subtotal: 40,
          tax_rate: 0,
          tax: 0,
          total: 40,
          payment_type: "contado",
          created_at: new Date(`${previousMonthDay}T16:00:00.000Z`).toISOString(),
        },
      ])
      .select("id");
    if (sales.error) throw sales.error;
    fixtureIds.sales.push(...sales.data.map((row) => row.id));

    const expenses = await service
      .from("expenses")
      .insert([
        {
          concept: "CHG15 registered",
          category: "otros",
          description: "Local dashboard fixture",
          amount: 15,
          date: today,
          payment_method: "efectivo",
          beneficiary: "Fixture",
          registered_by: admin.username,
          status: "registrado",
        },
        {
          concept: "CHG15 voided",
          category: "otros",
          description: "Local dashboard fixture",
          amount: 30,
          date: today,
          payment_method: "efectivo",
          beneficiary: "Fixture",
          registered_by: admin.username,
          status: "anulado",
          voided_at: voidedAt,
          void_reason: "Local dashboard fixture",
        },
        {
          concept: "CHG15 prior month",
          category: "otros",
          description: "Local dashboard fixture",
          amount: 20,
          date: previousMonthDay,
          payment_method: "efectivo",
          beneficiary: "Fixture",
          registered_by: admin.username,
          status: "registrado",
        },
      ])
      .select("id");
    if (expenses.error) throw expenses.error;
    fixtureIds.expenses.push(...expenses.data.map((row) => row.id));
  }

  test("shows honest empty states, then counts only active, current-period records", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/dashboard");

    const booked = page.getByRole("group", { name: "Ventas contabilizadas · mes" });
    await expect(booked).toContainText("RD$");
    await expect(booked).toContainText("No hay ventas contabilizadas este mes.");
    await expect(page.getByRole("group", { name: "Gastos registrados · mes" })).toContainText(
      "No hay gastos registrados este mes.",
    );
    const inventory = page.getByRole("group", { name: "Inventario a precio de venta" });
    await expect(inventory).toContainText("RD$");
    const inventoryBeforeText = await inventory.innerText();
    const inventoryValueMatch = inventoryBeforeText.match(/RD\$\s*([\d,.]+)/);
    const inventoryCountsMatch = inventoryBeforeText.match(/(\d+) activos · (\d+) inactivos/);
    if (!inventoryValueMatch || !inventoryCountsMatch) {
      throw new Error("Could not read the initial inventory dashboard fixture state");
    }
    const inventoryValueBefore = Number(inventoryValueMatch[1].replaceAll(",", ""));
    const activeInventoryBefore = Number(inventoryCountsMatch[1]);
    const inactiveInventoryBefore = Number(inventoryCountsMatch[2]);
    expectedDashboardInventoryValue = inventoryValueBefore + 60;
    expectedDashboardActiveItems = activeInventoryBefore + 1;
    expectedDashboardInactiveItems = inactiveInventoryBefore + 1;
    if (activeInventoryBefore === 0) {
      await expect(inventory).toContainText("No hay productos activos para estimar.");
    }
    await expect(page.getByRole("group", { name: "Clientes activos" })).toContainText(
      "No hay clientes registrados.",
    );
    await expect(page.getByText("Nueva venta", { exact: true })).toHaveCount(0);

    await seedDashboardData();
    await page.reload();
    await expect(booked).toContainText(/230/);
    await expect(booked).toContainText("3 documentos");
    await expect(booked).toContainText("3 hoy");
    await expect(booked).toContainText("1 sin forma de pago");
    await expect(page.getByRole("group", { name: "Ventas al contado · mes" })).toContainText(/60/);
    await expect(page.getByRole("group", { name: "Ventas al contado · mes" })).toContainText(
      "no incluye abonos a crédito",
    );
    await expect(page.getByRole("group", { name: "Gastos registrados · mes" })).toContainText(/15/);
    const expectedInventoryValue = new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: "DOP",
    }).format(inventoryValueBefore + 60);
    await expect(inventory).toContainText(expectedInventoryValue);
    await expect(inventory).toContainText(
      `${activeInventoryBefore + 1} activos · ${inactiveInventoryBefore + 1} inactivos`,
    );
    await expect(page.getByRole("group", { name: "Clientes activos" })).toContainText("1");
    await expect(page.getByRole("group", { name: "Clientes activos" })).toContainText(
      "1 inactivos",
    );
    await expect(page.getByText(`CHG15-VOID-${suffix}`, { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("La creación de ventas no aparece aquí", { exact: false }),
    ).toBeVisible();
    expect(adminSettings.tax_policy_approved).toBe(false);
  });

  test("shows a read error instead of zero and retries successfully", async ({ page }) => {
    let allowRetry = false;
    let expenseReads = 0;
    await page.route("**/*", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.pathname === "/rest/v1/expenses") expenseReads += 1;
      if (
        requestUrl.pathname === "/rest/v1/expenses" &&
        !allowRetry &&
        route.request().method() === "GET"
      ) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            code: "XX000",
            message: "temporary local dashboard read failure",
          }),
        });
      } else {
        await route.continue();
      }
    });
    await login(page);
    expect(expenseReads).toBeGreaterThan(0);

    const expenses = page.getByRole("group", { name: "Gastos registrados · mes" });
    await expect(expenses).toContainText("No se pudo confirmar este indicador.");
    await expect(expenses.getByText(/RD\$/)).toHaveCount(0);
    allowRetry = true;
    await page.getByRole("button", { name: "Reintentar gastos" }).click();
    await expect(expenses).toContainText(/15/);
    await expect(expenses).not.toContainText("No se pudo confirmar este indicador.");
  });

  test("limits employee dashboard reads, hides costs, and filters quick actions", async ({
    page,
  }) => {
    const resourceReads = [];
    let inventorySelect;
    page.on("request", (request) => {
      const requestUrl = new URL(request.url());
      const resource = requestUrl.pathname.match(
        /^\/rest\/v1\/(sales|inventory|clients|expenses)$/,
      )?.[1];
      if (resource) resourceReads.push(resource);
      if (resource === "inventory") inventorySelect = requestUrl.searchParams.get("select");
    });

    await login(page, employee);
    await page.goto("/dashboard");
    const inventory = page.getByRole("group", { name: "Inventario a precio de venta" });
    await expect(inventory).toContainText(
      new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(
        expectedDashboardInventoryValue,
      ),
    );
    await expect(inventory).toContainText(
      `${expectedDashboardActiveItems} activos · ${expectedDashboardInactiveItems} inactivos`,
    );
    await expect(page.getByRole("group", { name: "Ventas contabilizadas · mes" })).toContainText(
      "No disponible",
    );
    await expect(page.getByRole("group", { name: "Gastos registrados · mes" })).toContainText(
      "No disponible",
    );
    await expect(page.getByRole("group", { name: "Clientes activos" })).toContainText(
      "No disponible",
    );
    await expect(page.getByText("9999")).toHaveCount(0);
    await expect(page.getByText("8888")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Abrir inventario" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Abrir directorio" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Registrar gasto" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Registrar compra" })).toHaveCount(0);
    await expect(page.getByText("Nueva venta", { exact: true })).toHaveCount(0);
    expect(inventorySelect).toBe("id,price,quantity,is_active");
    expect(resourceReads.length).toBeGreaterThan(0);
    expect(resourceReads.every((resource) => resource === "inventory")).toBe(true);
  });

  test("remains usable at target widths and keyboard focus is visible", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    const inventoryLink = page.getByRole("link", { name: "Abrir inventario" });
    await expect(inventoryLink).toBeVisible();

    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole("heading", { name: "Panel General" })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow, `horizontal overflow at ${width}px`).toBe(false);
    }

    await inventoryLink.focus();
    await expect(inventoryLink).toBeFocused();
    await expect(inventoryLink).toHaveClass(/focus-visible:ring-2/);
    const contrast = await inventoryLink.locator("span").evaluate((element) => {
      const colorCanvas = document.createElement("canvas");
      colorCanvas.width = 1;
      colorCanvas.height = 1;
      const colorContext = colorCanvas.getContext("2d");
      const parse = (value) => {
        colorContext.fillStyle = "#000000";
        colorContext.fillStyle = value;
        colorContext.fillRect(0, 0, 1, 1);
        return [...colorContext.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      const luminance = (rgb) => {
        const channels = rgb.map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      let ancestor = element;
      while (ancestor && getComputedStyle(ancestor).backgroundColor === "rgba(0, 0, 0, 0)") {
        ancestor = ancestor.parentElement;
      }
      const foreground = luminance(parse(getComputedStyle(element).color));
      const background = luminance(parse(getComputedStyle(ancestor).backgroundColor));
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });
});
