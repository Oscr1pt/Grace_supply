import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.CHG17_DISPOSABLE_TESTS === "1";
const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const container = process.env.LOCAL_SUPABASE_CONTAINER;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const admin = {
  username: `chg17-admin-${suffix}`,
  email: `chg17-admin-${suffix}@example.test`,
  password: `Credit-${crypto.randomUUID()}-9c!`,
};
const employee = {
  username: `chg17-limited-${suffix}`,
  email: `chg17-limited-${suffix}@example.test`,
  password: `Credit-${crypto.randomUUID()}-9c!`,
};
const fixtures = {
  clients: [],
  suppliers: [],
  sales: [],
  purchases: [],
  clientCredits: [],
  supplierCredits: [],
};
let service;
let adminId;
let employeeId;
let clientName;
let supplierName;
let clientCreditId;
let supplierCreditId;
const invoiceNo = `CHG17-${suffix}`;

test.describe.serial("CHG-17 clients, suppliers and credit workflows", () => {
  test.skip(
    !enabled,
    "Financial browser tests run only against a verified disposable Supabase stack.",
  );

  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey || !container)
      throw new Error("CHG-17 requires explicit disposable local Supabase metadata.");
    const target = new URL(url);
    if (!["127.0.0.1", "localhost"].includes(target.hostname))
      throw new Error("CHG-17 refuses non-loopback Supabase URLs.");
    if (!/^supabase_db_(?:chg17|chg10run)[a-z0-9]+$/.test(container))
      throw new Error("CHG-17 refuses a non-disposable database container.");
    if (container.endsWith("jewel-sales-hub"))
      throw new Error("CHG-17 refuses the habitual database container.");

    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const createdAdmin = await service.auth.admin.createUser({
      email: admin.email,
      password: admin.password,
      email_confirm: true,
    });
    if (createdAdmin.error) throw createdAdmin.error;
    adminId = createdAdmin.data.user.id;
    const adminProfile = await service.from("user_profiles").insert({
      auth_user_id: adminId,
      username: admin.username,
      name: "Synthetic CHG-17 administrator",
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

    const createdEmployee = await service.auth.admin.createUser({
      email: employee.email,
      password: employee.password,
      email_confirm: true,
    });
    if (createdEmployee.error) throw createdEmployee.error;
    employeeId = createdEmployee.data.user.id;
    const employeeProfile = await service.from("user_profiles").insert({
      auth_user_id: employeeId,
      username: employee.username,
      name: "Synthetic CHG-17 limited employee",
      role: "employee",
      permissions: ["suppliers"],
      active: true,
    });
    if (employeeProfile.error) throw employeeProfile.error;
  });

  test.afterAll(async () => {
    if (!service) return;
    if (adminId) {
      const operations = await service
        .from("business_operations")
        .select("id")
        .eq("actor_id", adminId);
      for (const operation of operations.data ?? []) {
        await service.from("financial_audit_events").delete().eq("operation_id", operation.id);
        await service.from("business_operations").delete().eq("id", operation.id);
      }
    }
    for (const id of fixtures.clientCredits)
      await service.from("credit_payments").delete().eq("client_credit_id", id);
    for (const id of fixtures.supplierCredits)
      await service.from("credit_payments").delete().eq("supplier_credit_id", id);
    for (const id of fixtures.clientCredits)
      await service.from("client_credits").delete().eq("id", id);
    for (const id of fixtures.supplierCredits)
      await service.from("supplier_credits").delete().eq("id", id);
    for (const id of fixtures.sales) await service.from("sales").delete().eq("id", id);
    for (const id of fixtures.purchases) await service.from("purchases").delete().eq("id", id);
    for (const id of fixtures.clients) await service.from("clients").delete().eq("id", id);
    for (const id of fixtures.suppliers) await service.from("suppliers").delete().eq("id", id);
    for (const id of [employeeId, adminId]) {
      if (!id) continue;
      await service.from("user_profiles").delete().eq("auth_user_id", id);
      await service.auth.admin.deleteUser(id);
    }
  });

  async function login(page, identity = admin) {
    await page.goto("/login");
    const submit = page.getByRole("button", { name: "Entrar al sistema" });
    await expect(submit).toBeEnabled();
    await page.getByLabel("Usuario").fill(identity.username);
    await page.getByLabel("Contraseña").fill(identity.password);
    await expect(page.locator("#username")).toHaveValue(identity.username);
    await expect(page.locator("#password")).toHaveValue(identity.password);
    await submit.click();
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible({
      timeout: 10_000,
    });
  }

  async function seedRelatedHistory(clientId) {
    const sale = await service
      .from("sales")
      .insert({
        receipt_no: `CHG17-R-${suffix}`,
        client_id: clientId,
        subtotal: 100,
        tax_rate: 0,
        tax: 0,
        total: 100,
        payment_type: "credito",
        due_date: "2026-12-31",
      })
      .select("id")
      .single();
    if (sale.error) throw sale.error;
    fixtures.sales.push(sale.data.id);
    const clientCredit = await service
      .from("client_credits")
      .insert({
        sale_id: sale.data.id,
        client_id: clientId,
        receipt_no: `CHG17-R-${suffix}`,
        total: 100,
        paid: 0,
        balance: 100,
        status: "pendiente",
      })
      .select("id")
      .single();
    if (clientCredit.error) throw clientCredit.error;
    clientCreditId = clientCredit.data.id;
    fixtures.clientCredits.push(clientCredit.data.id);
  }

  test("client and supplier forms retain input, filter records, preserve linked history and fit narrow screens", async ({
    page,
  }) => {
    clientName = `CHG17 cliente ${suffix}`;
    supplierName = `CHG17 proveedor ${suffix}`;
    await login(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/clients");
    await page.getByRole("button", { name: "Nuevo cliente" }).focus();
    await page.keyboard.press("Enter");
    const clientDialog = page.getByRole("dialog");
    await clientDialog.getByRole("button", { name: "Agregar cliente" }).click();
    await expect(clientDialog.getByText("Escribe un nombre o razón social.")).toBeVisible();
    await clientDialog.getByLabel("Nombre o razón social").fill(clientName);
    await clientDialog.getByLabel("RNC / Cédula").fill("ID largo no normalizado 0000-X");
    await clientDialog.getByLabel("Correo electrónico").fill("correo-no-valido");
    await clientDialog.getByLabel("Notas / Preferencias").fill("nota ".repeat(600));
    await clientDialog.getByRole("button", { name: "Agregar cliente" }).click();
    await expect(
      clientDialog.getByText("Escribe un correo válido o deja este campo vacío."),
    ).toBeVisible();
    await expect(clientDialog.getByLabel("Notas / Preferencias")).toHaveValue("nota ".repeat(600));
    await clientDialog.getByLabel("Correo electrónico").fill(`cliente-${suffix}@example.test`);
    await clientDialog.getByRole("button", { name: "Agregar cliente" }).click();
    await expect(page.getByText("Cliente agregado")).toBeVisible();
    const client = await service.from("clients").select("id").eq("name", clientName).single();
    if (client.error) throw client.error;
    fixtures.clients.push(client.data.id);
    await seedRelatedHistory(client.data.id, "");

    await page.reload();
    const clientRow = page.locator("tr").filter({ hasText: clientName });
    await expect(clientRow).toBeVisible();
    await clientRow
      .getByRole("button", { name: `Desactivar o eliminar cliente ${clientName}` })
      .click();
    const clientAlert = page.getByRole("alertdialog");
    await expect(clientAlert.getByText(/tiene ventas o cr.ditos relacionados/)).toBeVisible();
    await expect(clientAlert.getByRole("button", { name: "Eliminar definitivamente" })).toHaveCount(
      0,
    );
    await clientAlert.getByRole("button", { name: "Desactivar" }).click();
    await expect(page.getByText("Cliente desactivado; su historial se conserva.")).toBeVisible();
    const clientStatus = await service
      .from("clients")
      .select("status")
      .eq("id", client.data.id)
      .single();
    expect(clientStatus.data.status).toBe("inactivo");
    expect(
      (await service.from("sales").select("id").eq("id", fixtures.sales[0])).data,
    ).toHaveLength(1);
    expect(
      (await service.from("client_credits").select("id").eq("id", clientCreditId)).data,
    ).toHaveLength(1);

    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.evaluate(() => {
        const main = document.querySelector("main").getBoundingClientRect();
        const tableRegion = document.querySelector('[aria-label^="Lista de clientes"]');
        const region = tableRegion.getBoundingClientRect();
        return {
          bodyWidth: document.body.clientWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          pageScrollX: window.scrollX,
          mainLeft: main.left,
          mainRight: main.right,
          regionLeft: region.left,
          regionRight: region.right,
          regionClientWidth: tableRegion.clientWidth,
          regionScrollWidth: tableRegion.scrollWidth,
          regionTabIndex: tableRegion.tabIndex,
        };
      });
      expect(layout.bodyWidth, `Body width at ${width}px: ${JSON.stringify(layout)}`).toBe(width);
      expect(layout.mainLeft).toBeGreaterThanOrEqual(-1);
      expect(layout.mainRight).toBeLessThanOrEqual(width + 1);
      expect(layout.regionLeft).toBeGreaterThanOrEqual(-1);
      expect(layout.regionRight).toBeLessThanOrEqual(width + 1);
      expect(layout.pageScrollX).toBe(0);
      expect(layout.documentScrollWidth).toBeLessThanOrEqual(width);
      expect(layout.bodyScrollWidth).toBeLessThanOrEqual(width);
      expect(layout.regionClientWidth).toBeLessThanOrEqual(width);
      if (width <= 768) {
        expect(layout.regionScrollWidth).toBeGreaterThan(layout.regionClientWidth);
      } else {
        expect(layout.regionScrollWidth).toBeGreaterThanOrEqual(layout.regionClientWidth);
      }
      expect(layout.regionTabIndex).toBe(0);
    }

    await page.goto("/suppliers");
    await page.getByRole("button", { name: "Nuevo proveedor" }).click();
    const supplierDialog = page.getByRole("dialog");
    await supplierDialog.getByLabel("Razón social o nombre").fill(supplierName);
    await supplierDialog.getByLabel("RNC / Identificación").fill("ID fiscal libre 123-ABC");
    await supplierDialog.getByLabel("Teléfono Principal").fill("809-".repeat(100));
    await supplierDialog.getByRole("button", { name: "Registrar proveedor" }).click();
    await expect(page.getByText("Proveedor registrado")).toBeVisible();
    const supplier = await service.from("suppliers").select("id").eq("name", supplierName).single();
    if (supplier.error) throw supplier.error;
    fixtures.suppliers.push(supplier.data.id);
    await seedSupplierHistory(supplier.data.id);
    await page.reload();
    const supplierRow = page.locator("tr").filter({ hasText: supplierName });
    await expect(supplierRow).toBeVisible();
    await supplierRow
      .getByRole("button", { name: `Desactivar o eliminar proveedor ${supplierName}` })
      .click();
    const supplierAlert = page.getByRole("alertdialog");
    await expect(supplierAlert.getByText(/tiene compras o cr.ditos relacionados/)).toBeVisible();
    await expect(
      supplierAlert.getByRole("button", { name: "Eliminar definitivamente" }),
    ).toHaveCount(0);
    await supplierAlert.getByRole("button", { name: "Desactivar" }).click();
    await expect(page.getByText("Proveedor desactivado; su historial se conserva.")).toBeVisible();
    const supplierStatus = await service
      .from("suppliers")
      .select("status")
      .eq("id", supplier.data.id)
      .single();
    expect(supplierStatus.data.status).toBe("inactivo");
    expect(
      (await service.from("purchases").select("id").eq("id", fixtures.purchases[0])).data,
    ).toHaveLength(1);
    expect(
      (await service.from("supplier_credits").select("id").eq("id", supplierCreditId)).data,
    ).toHaveLength(1);
  });

  async function seedSupplierHistory(supplierId) {
    const purchase = await service
      .from("purchases")
      .insert({
        supplier: supplierName,
        supplier_id: supplierId,
        description: `CHG17 fixture purchase ${suffix}`,
        quantity: 1,
        unit_cost: 55.55,
        total: 55.55,
        payment_type: "credito",
        invoice_no: invoiceNo,
      })
      .select("id")
      .single();
    if (purchase.error) throw purchase.error;
    fixtures.purchases.push(purchase.data.id);
    const credit = await service
      .from("supplier_credits")
      .insert({
        purchase_id: purchase.data.id,
        supplier_id: supplierId,
        supplier_name: supplierName,
        invoice_no: invoiceNo,
        total: 55.55,
        paid: 0,
        balance: 55.55,
        status: "pendiente",
      })
      .select("id")
      .single();
    if (credit.error) throw credit.error;
    supplierCreditId = credit.data.id;
    fixtures.supplierCredits.push(credit.data.id);
  }

  test("credit payments reconcile a lost post-commit response without a second movement", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/clients");
    const clientRow = page.locator("tr").filter({ hasText: clientName });
    await clientRow.getByRole("button", { name: /Ver cr.ditos de/ }).click();
    const creditDialog = page.getByRole("dialog");
    await expect(creditDialog.getByText("CHG17-R-" + suffix)).toBeVisible();
    await creditDialog.getByRole("button", { name: /Registrar Pago/ }).click();
    let postRequests = 0;
    await page.route("**/rest/v1/rpc/post_credit_payment", async (route) => {
      postRequests += 1;
      const response = await route.fetch();
      await response.body();
      await route.abort("failed");
    });
    await page.route("**/rest/v1/rpc/get_business_operation", (route) => route.abort("failed"));
    const paymentDialog = page.getByRole("dialog");
    await paymentDialog.getByLabel("Monto del pago").fill("40.00");
    await paymentDialog.getByLabel("Referencia (opcional)").fill(`TR-${suffix}`);
    await paymentDialog.getByLabel("Notas / Observaciones").fill("Abono parcial de prueba");
    await paymentDialog
      .getByRole("button", { name: "Confirmar Cobro" })
      .click({ clickCount: 2, delay: 10 });
    await expect(paymentDialog.getByText(/La respuesta no qued. confirmada/)).toBeVisible();
    expect(postRequests).toBe(1);
    const stored = await page.evaluate(() =>
      sessionStorage.getItem("grace-supply.pending-credit-payment.v1"),
    );
    const operation = JSON.parse(stored);
    expect(operation.actorId).toBe(adminId);
    expect(operation.creditId).toBe(clientCreditId);
    expect(operation.request.amount).toBe("40.00");
    expect(JSON.stringify(operation)).not.toMatch(
      /password|access[_-]?token|refresh[_-]?token|service[_-]?role|anon[_-]?key/i,
    );

    await page.goto("/suppliers");
    await expect(
      page.getByRole("status").filter({ hasText: /operaci.n financiera pendiente/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page.getByRole("button", { name: "Entrar al sistema" })).toBeVisible();
    await login(page, employee);
    await page.goto("/suppliers");
    const otherActorNotice = page.getByRole("status").filter({ hasText: /otra sesi.n o m.dulo/ });
    await expect(otherActorNotice).toBeVisible();
    await expect(
      otherActorNotice.getByRole("button", { name: /Consultar y reintentar/ }),
    ).toHaveCount(0);
    const retainedOperation = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("grace-supply.pending-credit-payment.v1")),
    );
    expect(retainedOperation.actorId).toBe(adminId);
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page.getByRole("button", { name: "Entrar al sistema" })).toBeVisible();
    await login(page, admin);
    await page.goto("/clients");
    const recoveredPaymentDialog = page.getByRole("dialog");
    await expect(recoveredPaymentDialog).toBeVisible();
    await expect(
      recoveredPaymentDialog.getByText(/La respuesta no qued. confirmada/),
    ).toBeVisible();
    await page.unroute("**/rest/v1/rpc/get_business_operation");
    await recoveredPaymentDialog
      .getByRole("button", { name: /Consultar y reintentar la misma operaci.n/ })
      .click();
    await expect(page.getByText("Pago confirmado y conciliado")).toBeVisible();
    const savedCredit = await service
      .from("client_credits")
      .select("paid,balance,status")
      .eq("id", clientCreditId)
      .single();
    expect(savedCredit.data).toEqual({ paid: 40, balance: 60, status: "parcial" });
    const savedPayments = await service
      .from("credit_payments")
      .select("id,amount,date,method,reference,note")
      .eq("client_credit_id", clientCreditId);
    expect(savedPayments.data).toHaveLength(1);
    expect(savedPayments.data[0]).toMatchObject({
      amount: 40,
      method: "efectivo",
      reference: `TR-${suffix}`,
      note: "Abono parcial de prueba",
    });
    const paidClientRow = page.locator("tr").filter({ hasText: clientName });
    await expect(
      paidClientRow.getByRole("button", { name: `Ver créditos de ${clientName}` }),
    ).toBeVisible();

    await page.reload();
    const refreshedClient = page.locator("tr").filter({ hasText: clientName });
    await refreshedClient.getByRole("button", { name: /Ver cr.ditos de/ }).click();
    const refreshedCredits = page.getByRole("dialog");
    await expect(refreshedCredits.getByRole("cell", { name: "RD$60.00" })).toBeVisible();

    await page.goto("/suppliers");
    const supplierRow = page.locator("tr").filter({ hasText: supplierName });
    await supplierRow.getByRole("button", { name: /Ver cr.ditos de/ }).click();
    const supplierCreditsDialog = page.getByRole("dialog");
    await expect(supplierCreditsDialog.getByText(invoiceNo)).toBeVisible();
    await supplierCreditsDialog.getByRole("button", { name: /Registrar Pago/ }).click();
    const supplierPaymentDialog = page.getByRole("dialog");
    await supplierPaymentDialog.getByLabel("Monto del pago").fill("55.55");
    await supplierPaymentDialog
      .getByLabel("Referencia (Nº Transferencia/Comprobante)")
      .fill(`CH-${suffix}`);
    await supplierPaymentDialog.getByRole("button", { name: /Confirmar Pago/ }).click();
    await expect(page.getByText("Pago confirmado y conciliado")).toBeVisible();
    const paidSupplierCredit = await service
      .from("supplier_credits")
      .select("paid,balance,status")
      .eq("id", supplierCreditId)
      .single();
    expect(paidSupplierCredit.data).toEqual({ paid: 55.55, balance: 0, status: "pagada" });
    const savedSupplierPayments = await service
      .from("credit_payments")
      .select("id,amount,method,reference")
      .eq("supplier_credit_id", supplierCreditId);
    expect(savedSupplierPayments.data).toHaveLength(1);
    expect(savedSupplierPayments.data[0]).toMatchObject({
      amount: 55.55,
      method: "transferencia",
      reference: `CH-${suffix}`,
    });
  });

  test("employees without client permission cannot open the client administration route", async ({
    page,
  }) => {
    await login(page, employee);
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Acceso restringido" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nuevo cliente" })).toHaveCount(0);
  });
});
