import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { parseBusinessReportResponse } from "../../src/lib/businessReportsContract.js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const password = `Reports-${crypto.randomUUID()}-8a!`;
const fixtureAnchorDate = "2027-01-12";
const fixtureWeekStart = "2027-01-11";
const fixtureWeekEndExclusive = "2027-01-18";
const fixtureMovementDate = "2027-01-13";
const fixtureMovementTimestamp = `${fixtureMovementDate}T16:00:00.000Z`;
const identities = {
  admin: { username: `reports-admin-${suffix}`, email: `reports-admin-${suffix}@example.test` },
  secondary: {
    username: `reports-admin-b-${suffix}`,
    email: `reports-admin-b-${suffix}@example.test`,
  },
  employee: {
    username: `reports-employee-${suffix}`,
    email: `reports-employee-${suffix}@example.test`,
  },
};
let service;
let adminToken;
let adminActor;
const fixtureClientId = crypto.randomUUID();

function assertLocalConfiguration() {
  if (!url || !anonKey || !serviceKey) throw new Error("Local Supabase credentials are required");
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(url).hostname)) {
    throw new Error("Business reports HTTP test refuses a non-local Supabase URL");
  }
}

async function createIdentity(identity, role, permissions) {
  const created = await service.auth.admin.createUser({
    email: identity.email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const profile = await service.from("user_profiles").insert({
    auth_user_id: created.data.user.id,
    username: identity.username,
    name: `Synthetic reports ${role}`,
    role,
    permissions,
    active: true,
  });
  if (profile.error) throw profile.error;
  return created.data.user.id;
}

async function requestReport(token, periodType = "week", anchorDate = fixtureAnchorDate) {
  return fetch(`${url}/rest/v1/rpc/get_business_report`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_period_type: periodType, p_anchor_date: anchorDate }),
  });
}

async function signInToken(email) {
  const actor = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await actor.auth.signInWithPassword({ email, password });
  if (result.error) throw result.error;
  return { actor, token: result.data.session.access_token };
}

async function loginThroughApplication(page, identity) {
  await page.goto("/login");
  // Wait for the auth provider's explicit initialization state. Cold Vite
  // compilation can take longer than Playwright's default locator timeout.
  await expect(page.locator('form[aria-busy="false"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Entrar al sistema" })).toBeEnabled();
  await page.getByLabel("Usuario").fill(identity.username);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar al sistema" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
}

test.describe.serial("Business reports authenticated HTTP integration", () => {
  test.beforeAll(async () => {
    assertLocalConfiguration();
    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminId = await createIdentity(identities.admin, "admin", []);
    await createIdentity(identities.secondary, "admin", []);
    await createIdentity(identities.employee, "employee", ["dashboard", "sales"]);

    const client = await service.from("clients").insert({
      id: fixtureClientId,
      name: `Synthetic reports client ${suffix}`,
    });
    if (client.error) throw client.error;

    const sales = await service.from("sales").insert([
      {
        receipt_no: `GS-RPT-${suffix}-CASH`,
        client_id: fixtureClientId,
        subtotal: 100,
        tax_rate: 18,
        tax: 18,
        total: 118,
        payment_type: "contado",
        created_at: fixtureMovementTimestamp,
      },
      {
        receipt_no: `GS-RPT-${suffix}-CREDIT`,
        client_id: fixtureClientId,
        subtotal: 50,
        tax_rate: 18,
        tax: 9,
        total: 59,
        payment_type: "credito",
        created_at: fixtureMovementTimestamp,
      },
      {
        receipt_no: `GS-RPT-${suffix}-VOID`,
        client_id: fixtureClientId,
        subtotal: 999,
        tax_rate: 18,
        tax: 179.82,
        total: 1178.82,
        payment_type: "contado",
        created_at: fixtureMovementTimestamp,
        voided_at: "2026-11-25T00:00:00.000Z",
      },
    ]);
    if (sales.error) throw sales.error;

    const purchases = await service.from("purchases").insert([
      {
        supplier: "Synthetic report supplier",
        description: "Active HTTP fixture",
        quantity: 1,
        unit_cost: 30,
        total: 30,
        payment_type: "contado",
        created_at: fixtureMovementTimestamp,
      },
      {
        supplier: "Synthetic report supplier",
        description: "Voided HTTP fixture",
        quantity: 1,
        unit_cost: 70,
        total: 70,
        payment_type: "contado",
        created_at: fixtureMovementTimestamp,
        voided_at: "2026-11-25T00:00:00.000Z",
      },
    ]);
    if (purchases.error) throw purchases.error;

    const expenses = await service.from("expenses").insert([
      {
        concept: "Synthetic report payroll",
        category: "nomina",
        amount: 10,
        date: fixtureMovementDate,
        payment_method: "efectivo",
        beneficiary: "Synthetic",
        registered_by: "reports-http-test",
        status: "registrado",
      },
      {
        concept: "Synthetic report transport",
        category: "transporte",
        amount: 5,
        date: fixtureMovementDate,
        payment_method: "efectivo",
        beneficiary: "Synthetic",
        registered_by: "reports-http-test",
        status: "registrado",
      },
      {
        concept: "Synthetic voided report expense",
        category: "otros",
        amount: 100,
        date: fixtureMovementDate,
        payment_method: "efectivo",
        beneficiary: "Synthetic",
        registered_by: "reports-http-test",
        status: "anulado",
        voided_at: "2026-11-25T00:00:00.000Z",
      },
    ]);
    if (expenses.error) throw expenses.error;

    const admin = await signInToken(identities.admin.email);
    adminToken = admin.token;
    adminActor = admin.actor;
    if (!adminId) throw new Error("Synthetic administrator identity was not created");
  });

  test("PostgREST authorizes only active administrators and returns contract-valid aggregates", async () => {
    const adminResponse = await requestReport(adminToken);
    expect(adminResponse.status).toBe(200);
    const report = await adminResponse.json();
    const parsed = parseBusinessReportResponse(report, {
      type: "week",
      anchorDate: fixtureAnchorDate,
      startDate: fixtureWeekStart,
      endDateExclusive: fixtureWeekEndExclusive,
    });
    expect(parsed.metrics).toEqual({
      salesSubtotal: "150.00",
      operatingExpenses: "15.00",
      merchandisePurchases: "30.00",
      salesTax: "27.00",
    });
    expect(parsed.hasMovements).toBe(true);
    expect(JSON.stringify(report)).not.toContain(identities.admin.email);

    const employee = await signInToken(identities.employee.email);
    const employeeResponse = await requestReport(employee.token);
    expect([401, 403]).toContain(employeeResponse.status);
    await employee.actor.auth.signOut({ scope: "local" });

    const anonymousResponse = await requestReport(anonKey);
    expect([401, 403]).toContain(anonymousResponse.status);
    const invalidSessionResponse = await requestReport("invalid-local-session-token");
    expect([401, 403]).toContain(invalidSessionResponse.status);

    const secondAdmin = await signInToken(identities.secondary.email);
    const secondAdminResponse = await requestReport(secondAdmin.token);
    expect(secondAdminResponse.status).toBe(200);
    await secondAdmin.actor.auth.signOut({ scope: "local" });
  });

  test("real username login opens Reports and revocation blocks route data and the still-valid token", async ({
    page,
  }) => {
    await loginThroughApplication(page, identities.admin);
    await expect(page.getByRole("link", { name: "Reportes" })).toBeVisible();
    await page.getByRole("link", { name: "Reportes" }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByTestId("report-metric-value").first()).toHaveText("RD$ 150.00");

    const deactivated = await service
      .from("user_profiles")
      .update({ active: false })
      .eq("username", identities.admin.username);
    if (deactivated.error) throw deactivated.error;

    const staleTokenResponse = await requestReport(adminToken);
    expect([401, 403]).toContain(staleTokenResponse.status);

    await page.goto("/reports");
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
    await page.getByLabel("Usuario").fill(identities.admin.username);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page.getByRole("alert")).toContainText(/inválidos|no est[aá] disponible/i);
  });

  test("employee is denied by the route and anonymous navigation returns to login", async ({
    page,
  }) => {
    await loginThroughApplication(page, identities.employee);
    await expect(page.getByRole("link", { name: "Reportes" })).toHaveCount(0);
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Acceso restringido" })).toBeVisible();
    await expect(page.getByTestId("report-metric-value")).toHaveCount(0);

    const anonymousPage = await page.context().newPage();
    await anonymousPage.goto("/reports");
    await expect(anonymousPage).toHaveURL(/\/login$/, { timeout: 20_000 });
  });

  test("empty period, network failure, retry, pending print and late responses use current data only", async ({
    page,
  }) => {
    await loginThroughApplication(page, identities.secondary);
    await page.getByRole("link", { name: "Reportes" }).click();
    await page.getByLabel("Seleccionar semana").fill(fixtureAnchorDate);
    await expect(page.getByTestId("report-metric-value").first()).toHaveText("RD$ 150.00");

    await page.getByLabel("Tipo de período").selectOption("year");
    await page.getByLabel("Seleccionar año").fill("2025");
    await expect(page.getByRole("status")).toContainText(/no hay movimientos/i);
    await expect(page.getByTestId("report-metric-value")).toHaveCount(4);
    await expect(page.getByTestId("report-metric-value").first()).toHaveText("RD$ 0.00");

    await page.route(
      "**/rest/v1/rpc/get_business_report",
      async (route) => {
        await route.abort("failed");
      },
      { times: 1 },
    );
    await page.getByLabel("Seleccionar año").fill("2024");
    await expect(page.getByRole("alert")).toContainText(/no se pudo cargar/i);
    await expect(page.getByRole("button", { name: "Imprimir / Guardar PDF" })).toBeDisabled();
    await page.getByRole("button", { name: "Reintentar" }).click();
    await expect(page.getByRole("status")).toContainText(/no hay movimientos/i);
    await expect(page.getByTestId("report-metric-value").first()).toHaveText("RD$ 0.00");
    await page.unrouteAll();

    let startSlowRequest;
    let releaseSlowRequest;
    const slowStarted = new Promise((resolve) => {
      startSlowRequest = resolve;
    });
    const slowRelease = new Promise((resolve) => {
      releaseSlowRequest = resolve;
    });
    await page.route("**/rest/v1/rpc/get_business_report", async (route) => {
      const body = route.request().postDataJSON();
      if (body.p_period_type === "week" && body.p_anchor_date === fixtureAnchorDate) {
        const response = await route.fetch();
        startSlowRequest();
        await slowRelease;
        await route.fulfill({ response });
        return;
      }
      await route.continue();
    });

    await page.getByLabel("Tipo de período").selectOption("week");
    await page.getByLabel("Seleccionar semana").fill(fixtureAnchorDate);
    await slowStarted;
    await expect(page.getByRole("button", { name: "Imprimir / Guardar PDF" })).toBeDisabled();
    await page.getByLabel("Seleccionar semana").fill("2027-01-19");
    await expect(page.getByRole("status")).toContainText(/no hay movimientos/i);
    await releaseSlowRequest();
    await expect(page.getByRole("status")).toContainText(/no hay movimientos/i);
    await expect(page.getByTestId("report-metric-value").first()).toHaveText("RD$ 0.00");
    expect(await page.getByLabel("Seleccionar semana").inputValue()).toBe("2027-01-19");
  });
});
