import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.CHG19_DISPOSABLE_TESTS === "1";
const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const container = process.env.LOCAL_SUPABASE_CONTAINER;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const concept = `CHG19 gasto ${suffix}`;
const admin = {
  username: `chg19-admin-${suffix}`,
  email: `chg19-${suffix}@example.test`,
  password: `Expenses-${crypto.randomUUID()}-9c!`,
};
let service;
let adminId;
let expenseId;

test.describe.serial("CHG-19 expense operations UX", () => {
  test.skip(!enabled, "Expense integration browser tests require a verified disposable stack.");

  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey || !container)
      throw new Error("Explicit local stack metadata is required.");
    const target = new URL(url);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname))
      throw new Error("Refusing non-local Supabase.");
    if (!/^supabase_db_(?:chg18|chg10run)[a-z0-9]+$/.test(container))
      throw new Error("Refusing non-disposable database.");
    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
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
      name: "Synthetic CHG-19 admin",
      role: "admin",
      permissions: ["dashboard", "expenses"],
      active: true,
    });
    if (profile.error) throw profile.error;
  });

  test.afterAll(async () => {
    if (!service) return;
    if (!expenseId) {
      const created = await service
        .from("expenses")
        .select("id")
        .eq("concept", concept)
        .maybeSingle();
      if (!created.error && created.data) expenseId = created.data.id;
    }
    if (expenseId) {
      const current = await service
        .from("expenses")
        .select("status")
        .eq("id", expenseId)
        .maybeSingle();
      if (!current.error && current.data?.status === "registrado") {
        await service.rpc("annul_financial_document", {
          p_request: {
            idempotency_key: crypto.randomUUID(),
            document_type: "expense",
            document_id: expenseId,
            reason: "Cleanup synthetic CHG-19 browser fixture",
          },
        });
      }
    }
    if (adminId) await service.auth.admin.deleteUser(adminId);
  });

  async function signIn(page) {
    await page.goto("/login");
    const submit = page.getByRole("button", { name: "Entrar al sistema" });
    await expect(submit).toBeEnabled();
    const usernameInput = page.locator("#username");
    const passwordInput = page.locator("#password");
    await usernameInput.fill(admin.username);
    await passwordInput.fill(admin.password);
    await expect(usernameInput).toHaveValue(admin.username);
    await expect(passwordInput).toHaveValue(admin.password);
    await submit.click();
    await expect(page.getByRole("heading", { name: "Panel General" })).toBeVisible();
  }

  test("validates money, saves once, filters, and keeps annulled expense history", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 780 });
    await signIn(page);
    await page.goto("/expenses");
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 780 });
      const pageFitsViewport = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      );
      expect(pageFitsViewport, `document should fit ${width}px viewport`).toBe(true);
    }
    await page.setViewportSize({ width: 320, height: 780 });
    await page.getByRole("button", { name: "Registrar gasto" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(":focus")).toHaveCount(1);
    await dialog.getByLabel("Concepto").fill(concept);
    await dialog.getByLabel("Beneficiario (Empresa / Persona)").fill("Synthetic CHG-19");
    await dialog.getByLabel("Monto").fill("1.001");
    await dialog.getByRole("button", { name: "Registrar gasto" }).click();
    await expect(
      dialog.getByText("El importe debe ser mayor que cero y tener hasta dos decimales."),
    ).toBeVisible();
    await dialog.getByLabel("Monto").fill("125.50");
    await dialog.getByLabel("Fecha").fill("2026-11-01");
    const save = dialog.getByRole("button", { name: "Registrar gasto" });
    let abortedPostRequests = 0;
    await page.route("**/rpc/post_expense", (route) => {
      abortedPostRequests += 1;
      return route.abort("failed");
    });
    await save.evaluate((button) => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await expect.poll(() => abortedPostRequests).toBe(1);
    await expect(dialog.getByRole("status")).toContainText("resultado del gasto");
    const pendingIntent = await page.evaluate((actorId) => {
      const stored = sessionStorage.getItem(`grace.pending-business-operation.v1:${actorId}`);
      return stored ? JSON.parse(stored) : null;
    }, adminId);
    expect(pendingIntent).toMatchObject({
      type: "expense",
      actorId: adminId,
      request: { concept, amount: "125.50", date: "2026-11-01" },
    });
    await page.unroute("**/rpc/post_expense");
    await page.reload();
    const restoredDialog = page.getByRole("dialog");
    await expect(restoredDialog).toBeVisible();
    await expect(restoredDialog.getByLabel("Concepto")).toHaveValue(concept);
    await expect(restoredDialog.getByLabel("Monto")).toHaveValue("125.50");
    await restoredDialog.getByRole("button", { name: "Consultar y reintentar" }).click();
    await expect(restoredDialog).toBeHidden();
    const clearedIntent = await page.evaluate(
      (actorId) => sessionStorage.getItem(`grace.pending-business-operation.v1:${actorId}`),
      adminId,
    );
    expect(clearedIntent).toBeNull();
    const saved = await service
      .from("expenses")
      .select("id,amount,status,date,concept")
      .eq("concept", concept);
    expect(saved.error).toBeNull();
    expect(saved.data).toHaveLength(1);
    expect(saved.data[0]).toMatchObject({
      amount: 125.5,
      status: "registrado",
      date: "2026-11-01",
    });
    expenseId = saved.data[0].id;

    const search = page.getByPlaceholder(/Buscar concepto/);
    await search.fill(concept);
    const status = page.getByRole("combobox").nth(2);
    await status.click();
    await page.getByRole("option", { name: "Registrados (Activos)" }).click();
    const row = page.getByRole("row").filter({ hasText: concept });
    await row.getByRole("button", { name: `Anular gasto ${concept}` }).click();
    const annulDialog = page.getByRole("alertdialog");
    await expect(annulDialog).toBeVisible();
    await expect(annulDialog.locator(":focus")).toHaveCount(1);
    await annulDialog.getByLabel("Motivo obligatorio").fill("Synthetic UX annulment");
    await annulDialog.getByRole("button", { name: "Confirmar anulación" }).click();
    await expect(row).toBeHidden();
    await status.click();
    await page.getByRole("option", { name: "Anulados" }).click();
    await expect(row.getByText("Anulado")).toBeVisible();
    const history = await service
      .from("expenses")
      .select("id,amount,status,void_reason")
      .eq("id", expenseId)
      .single();
    expect(history.error).toBeNull();
    expect(history.data).toMatchObject({
      id: expenseId,
      amount: 125.5,
      status: "anulado",
      void_reason: "Synthetic UX annulment",
    });
  });
});
