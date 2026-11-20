import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const username = `build-auth-${suffix}`;
const email = `build-auth-${suffix}@example.test`;
const password = `BuildAuth-${crypto.randomUUID()}-a9!`;
const usernameB = `build-auth-b-${suffix}`;
const emailB = `${usernameB}@example.test`;
const passwordB = `BuildAuthB-${crypto.randomUUID()}-b8!`;
const usernameC = `build-auth-c-${suffix}`;
const emailC = `${usernameC}@example.test`;
const passwordC = `BuildAuthC-${crypto.randomUUID()}-c7!`;
let adminUsername;
let adminEmail;
const adminPassword = `BuildAuthAdmin-${crypto.randomUUID()}-d6!`;
const adminName = `Synthetic compiled auth administrator ${suffix}`;
let service;
let identityId;
let identityBId;
let identityCId;
let identityAdminId;

test.describe("compiled frontend auth against isolated local Supabase", () => {
  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey)
      throw new Error("Isolated local Supabase keys are required.");
    if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname)) {
      throw new Error("Refusing to run compiled auth tests against a non-local Supabase target.");
    }
    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw new Error("Could not create the synthetic local auth identity.");
    identityId = created.data.user.id;
    const profile = await service.from("user_profiles").insert({
      auth_user_id: identityId,
      username,
      name: `Synthetic compiled auth ${suffix}`,
      role: "employee",
      permissions: ["dashboard", "purchases"],
      active: true,
    });
    if (profile.error) throw new Error("Could not create the synthetic local profile.");
    const createdB = await service.auth.admin.createUser({
      email: emailB,
      password: passwordB,
      email_confirm: true,
    });
    if (createdB.error)
      throw new Error("Could not create the second synthetic local auth identity.");
    identityBId = createdB.data.user.id;
    const profileB = await service.from("user_profiles").insert({
      auth_user_id: identityBId,
      username: usernameB,
      name: `Synthetic compiled auth B ${suffix}`,
      role: "employee",
      permissions: ["dashboard", "purchases"],
      active: true,
    });
    if (profileB.error) throw new Error("Could not create the second synthetic local profile.");
    const createdC = await service.auth.admin.createUser({
      email: emailC,
      password: passwordC,
      email_confirm: true,
    });
    if (createdC.error) throw new Error("Could not create the third synthetic local identity.");
    identityCId = createdC.data.user.id;
    const profileC = await service.from("user_profiles").insert({
      auth_user_id: identityCId,
      username: usernameC,
      name: `Synthetic compiled auth C ${suffix}`,
      role: "employee",
      permissions: ["dashboard", "purchases"],
      active: true,
    });
    if (profileC.error) throw new Error("Could not create the third synthetic local profile.");
    const existingAdmin = await service
      .from("user_profiles")
      .select("auth_user_id,username")
      .eq("role", "admin")
      .eq("active", true)
      .like("username", "build-auth-admin-%")
      .limit(1)
      .maybeSingle();
    if (existingAdmin.error) throw new Error("Could not find the synthetic local administrator.");
    if (existingAdmin.data) {
      identityAdminId = existingAdmin.data.auth_user_id;
      adminUsername = existingAdmin.data.username;
      const existingIdentity = await service.auth.admin.getUserById(identityAdminId);
      if (existingIdentity.error || !existingIdentity.data.user?.email)
        throw new Error("Could not resolve the synthetic local administrator identity.");
      adminEmail = existingIdentity.data.user.email;
      const updatedAdmin = await service.auth.admin.updateUserById(identityAdminId, {
        password: adminPassword,
      });
      if (updatedAdmin.error)
        throw new Error("Could not prepare the synthetic local administrator.");
    } else {
      adminUsername = `build-auth-admin-${suffix}`;
      adminEmail = `${adminUsername}@example.test`;
      const createdAdmin = await service.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
      });
      if (createdAdmin.error)
        throw new Error("Could not create the synthetic local administrator.");
      identityAdminId = createdAdmin.data.user.id;
      const adminProfile = await service.from("user_profiles").insert({
        auth_user_id: identityAdminId,
        username: adminUsername,
        name: adminName,
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
      if (adminProfile.error)
        throw new Error("Could not create the synthetic local administrator profile.");
    }
  });

  test.afterAll(async () => {
    if (!service || !identityId) return;
    const identities = [identityId, identityBId, identityCId].filter(Boolean);
    for (const id of identities) {
      const profile = await service.from("user_profiles").delete().eq("auth_user_id", id);
      if (profile.error)
        throw new Error(`Could not clean synthetic profile (${profile.error.code}).`);
      const removed = await service.auth.admin.deleteUser(id);
      if (removed.error)
        throw new Error(`Could not clean synthetic identity (${removed.error.code}).`);
    }
  });

  test("login, profile, dashboard, reload, protected route, logout, and relogin work in the compiled build", async ({
    page,
    context,
  }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/login");
    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel(/Contrase/).fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.reload();
    await expect(page.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toBeVisible();
    await page.getByRole("link", { name: "Compras" }).click();
    await expect(page).toHaveURL(/\/purchases$/);
    await expect(page.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toBeVisible();

    const unauthenticated = await context.newPage();
    await unauthenticated.goto("/dashboard");
    await expect(unauthenticated).toHaveURL(/\/login$/);
    await unauthenticated.close();

    await page.getByRole("button", { name: "Cerrar sesi\u00f3n" }).click();
    await expect(page).toHaveURL(/\/login$/);
    const idleStateAfterLogout = await page.evaluate(
      (id) => ({
        activity: sessionStorage.getItem(`grace.idle.last-activity.v1:${id}`),
        expired: sessionStorage.getItem(`grace.idle.expired.v1:${id}`),
      }),
      identityId,
    );
    expect(idleStateAfterLogout).toEqual({ activity: null, expired: null });
    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel(/Contrase/).fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(pageErrors).toEqual([]);
  });

  test("warning, continue, reload expiry and pending financial reconciliation stay tab-local", async ({
    page,
  }) => {
    const pageErrors = [];
    let financialSubmissions = 0;
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      if (
        /\/rpc\/(post_sale|post_purchase|post_credit_payment|reverse_credit_payment|annul_financial_document)/.test(
          request.url(),
        )
      ) {
        financialSubmissions += 1;
      }
    });
    await page.goto("/login");
    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel(/Contrase/).fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible({
      timeout: 20_000,
    });

    await page.evaluate((id) => {
      sessionStorage.setItem(
        `grace.idle.last-activity.v1:${id}`,
        String(Date.now() - 114 * 60_000),
      );
    }, identityId);
    await page.reload();
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.evaluate((id) => {
      sessionStorage.setItem(
        `grace.idle.last-activity.v1:${id}`,
        String(Date.now() - 115 * 60_000),
      );
    }, identityId);
    await page.reload();
    const warning = page.getByRole("dialog");
    await expect(warning).toBeVisible();
    await expect(warning.getByText("Tu sesión está por expirar")).toBeVisible();
    await expect(warning.getByText(/Tiempo restante:/)).toContainText(/4:[0-5]\d|5:00/);
    await warning.getByRole("button", { name: "Continuar sesión" }).click();
    await expect(warning).toBeHidden();
    const resumedAt = await page.evaluate(
      (id) => Number(sessionStorage.getItem(`grace.idle.last-activity.v1:${id}`)),
      identityId,
    );
    expect(Date.now() - resumedAt).toBeLessThan(10_000);

    await page.evaluate((id) => {
      sessionStorage.setItem(
        `grace.idle.last-activity.v1:${id}`,
        String(Date.now() - 120 * 60_000),
      );
      sessionStorage.setItem(
        `grace.pending-business-operation.v1:${id}`,
        JSON.stringify({
          actorId: id,
          type: "purchase",
          idempotencyKey: "synthetic-idle-reconcile-key",
          request: { idempotency_key: "synthetic-idle-reconcile-key" },
          context: { synthetic: true },
        }),
      );
    }, identityId);
    await page.reload();
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
    await expect(page.getByRole("status")).toContainText("Tu sesión se cerró por inactividad");
    await expect(page.getByRole("button", { name: "Compras" })).toHaveCount(0);
    const pendingOperation = await page.evaluate(
      (id) => sessionStorage.getItem(`grace.pending-business-operation.v1:${id}`),
      identityId,
    );
    expect(JSON.parse(pendingOperation).idempotencyKey).toBe("synthetic-idle-reconcile-key");
    expect(financialSubmissions).toBe(0);
    await expect(
      page.getByText(/Compra confirmada|Compra reconciliada|Compra y cuenta por pagar confirmadas/),
    ).toHaveCount(0);

    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel(/Contrase/).fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible({
      timeout: 20_000,
    });
    expect(pageErrors).toEqual([]);
  });

  test("idle expiry does not retry or falsely confirm an unresolved submitted operation", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel(/Contrase/).fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toBeVisible({
      timeout: 20_000,
    });

    let requestCount = 0;
    let releaseRequest;
    const intercepted = new Promise((resolve) => {
      releaseRequest = resolve;
    });
    await page.route("**/rest/v1/rpc/post_purchase", async (route) => {
      requestCount += 1;
      await intercepted;
      await route.abort("failed");
    });
    await page.evaluate(
      ({ id, url, anonKey }) => {
        sessionStorage.setItem(
          `grace.pending-business-operation.v1:${id}`,
          JSON.stringify({
            actorId: id,
            type: "purchase",
            idempotencyKey: "synthetic-inflight-idle-key",
            request: { idempotency_key: "synthetic-inflight-idle-key" },
          }),
        );
        window.__idleRequestSettled = false;
        window.__idleRequest = fetch(`${url}/rest/v1/rpc/post_purchase`, {
          method: "POST",
          headers: {
            apikey: anonKey,
            authorization: "Bearer synthetic-intercepted-test-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({ idempotency_key: "synthetic-inflight-idle-key" }),
        })
          .catch(() => undefined)
          .finally(() => {
            window.__idleRequestSettled = true;
          });
        return true;
      },
      { id: identityId, url, anonKey },
    );
    await expect.poll(() => requestCount).toBe(1);

    await page.evaluate(() => {
      const realNow = Date.now;
      Date.now = () => realNow() + 120 * 60_000;
      window.dispatchEvent(new Event("pageshow"));
    });
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
    expect(requestCount).toBe(1);
    expect(await page.evaluate(() => window.__idleRequestSettled)).toBe(false);
    expect(
      JSON.parse(
        await page.evaluate(
          (id) => sessionStorage.getItem(`grace.pending-business-operation.v1:${id}`),
          identityId,
        ),
      ).idempotencyKey,
    ).toBe("synthetic-inflight-idle-key");
    await expect(page.getByText(/Compra confirmada|Compra reconciliada/)).toHaveCount(0);

    releaseRequest();
    await page.evaluate(() => window.__idleRequest);
    expect(requestCount).toBe(1);
    expect(await page.evaluate(() => window.__idleRequestSettled)).toBe(true);
  });

  test("resume from a suspended page rechecks elapsed wall time before retaining private access", async ({
    page,
  }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/login");
    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel(/Contrase/).fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toBeVisible({
      timeout: 20_000,
    });

    await page.evaluate((id) => {
      const realNow = Date.now;
      Date.now = () => realNow() + 120 * 60_000;
      window.dispatchEvent(new Event("pageshow"));
    }, identityId);
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Compras" })).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("a late profile response cannot restore a revoked identity", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    let releaseProfiles;
    let capturedFirstProfile;
    const profileGate = new Promise((resolve) => {
      releaseProfiles = resolve;
    });
    const firstProfileCaptured = new Promise((resolve) => {
      capturedFirstProfile = resolve;
    });
    const heldProfiles = [];
    let holdProfiles = true;
    await page.route("**/rest/v1/user_profiles?*", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (
        route.request().method() !== "GET" ||
        requestUrl.searchParams.get("auth_user_id") !== `eq.${identityCId}` ||
        !holdProfiles
      ) {
        return route.continue();
      }
      const response = await route.fetch();
      const body = await response.body();
      heldProfiles.push({ response, body });
      capturedFirstProfile();
      await profileGate;
      await route.fulfill({ response, body });
    });
    await page.goto("/login");
    await page.getByLabel("Usuario").fill(usernameC);
    await page.getByLabel(/Contrase/).fill(passwordC);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await firstProfileCaptured;
    const adminTab = await page.context().newPage();
    await adminTab.goto("/login");
    await adminTab.getByLabel("Usuario").fill(adminUsername);
    await adminTab.getByLabel(/Contrase/).fill(adminPassword);
    await adminTab.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(adminTab.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toBeVisible({
      timeout: 20_000,
    });
    await adminTab.getByRole("link", { name: "Empleados" }).click();
    const employeeName = `Synthetic compiled auth C ${suffix}`;
    const employeeRow = adminTab.getByRole("row").filter({ hasText: `@${usernameC}` });
    await expect(employeeRow).toBeVisible({ timeout: 20_000 });
    await employeeRow.getByRole("button", { name: /ver detalles/i }).click();
    await adminTab
      .getByRole("dialog")
      .getByRole("button", { name: /revocar acceso/i })
      .click();
    const revokeDialog = adminTab.getByRole("alertdialog");
    const revokedUserResponse = page.waitForResponse((response) => {
      const requestUrl = new URL(response.url());
      return requestUrl.pathname.endsWith("/auth/v1/user");
    });
    await revokeDialog.getByRole("button", { name: "Revocar acceso" }).click();
    await expect(adminTab.getByText("Acceso revocado.")).toBeVisible();
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    expect((await revokedUserResponse).status()).toBe(403);
    holdProfiles = false;
    releaseProfiles();
    await expect(page.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toHaveCount(0);
    await expect(page.getByText(`Synthetic compiled auth C ${suffix}`)).toHaveCount(0);
    const staleRows = JSON.parse(Buffer.from(heldProfiles[0].body).toString("utf8"));
    expect(staleRows[0]?.active).toBe(true);
    await expect(page.getByRole("button", { name: "Entrar al sistema" })).toBeEnabled();
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    const loginButton = page.getByRole("button", { name: "Entrar al sistema" });
    await expect(loginButton).toBeEnabled();
    await page.getByLabel("Usuario").fill(usernameC);
    await page.getByLabel(/Contrase/).fill(passwordC);
    await loginButton.click();
    await expect(page.getByText(/Usuario o contrase\u00f1a inv\u00e1lidos/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    await adminTab.close();
  });

  test("an expired pending purchase reconciles after fresh login without resubmission", async ({
    page,
  }) => {
    const key = `synthetic-idle-committed-${crypto.randomUUID()}`;
    let postPurchaseRequests = 0;
    let reconciliationRequests = 0;
    await page.goto("/login");
    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel(/Contrase/).fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toBeVisible({
      timeout: 20_000,
    });
    await page.evaluate(
      ({ id, key }) => {
        sessionStorage.setItem(
          `grace.idle.last-activity.v1:${id}`,
          String(Date.now() - 120 * 60_000),
        );
        sessionStorage.setItem(
          `grace.pending-business-operation.v1:${id}`,
          JSON.stringify({
            actorId: id,
            type: "purchase",
            idempotencyKey: key,
            request: { idempotency_key: key },
            context: {
              supplierId: "synthetic-supplier",
              invoiceNo: "SYNTHETIC-IDLE-RECONCILIATION",
            },
          }),
        );
      },
      { id: identityId, key },
    );
    await page.reload();
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Compras" })).toHaveCount(0);
    expect(
      await page.evaluate(
        (id) => sessionStorage.getItem(`grace.pending-business-operation.v1:${id}`) !== null,
        identityId,
      ),
    ).toBe(true);

    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel(/Contrase/).fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("link", { name: "Compras" }).click();
    const recoveredDialog = page.getByRole("dialog");
    await expect(recoveredDialog).toBeVisible();
    await expect(
      recoveredDialog.getByRole("button", { name: "Consultar operaci\u00f3n" }),
    ).toBeVisible();

    await page.route("**/rest/v1/rpc/post_purchase", async (route) => {
      postPurchaseRequests += 1;
      await route.abort();
    });
    await page.route("**/rest/v1/rpc/get_business_operation", async (route) => {
      reconciliationRequests += 1;
      const body = route.request().postDataJSON();
      expect(body).toEqual({ p_operation_type: "purchase", p_idempotency_key: key });
      if (reconciliationRequests === 1) {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ code: "42501", message: "permission denied" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          operation_id: crypto.randomUUID(),
          purchase_id: crypto.randomUUID(),
        }),
      });
    });
    const reconcileButton = recoveredDialog.getByRole("button", {
      name: "Consultar operaci\u00f3n",
    });
    const deniedResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/rpc/get_business_operation") &&
        response.status() === 403,
    );
    await reconcileButton.click();
    await deniedResponse;
    await expect(reconcileButton).toBeEnabled();
    expect(
      await page.evaluate(
        (id) => sessionStorage.getItem("grace.pending-business-operation.v1:" + id) !== null,
        identityId,
      ),
    ).toBe(true);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Panel General" })).toBeVisible();
    await page.goto("/purchases");
    const resumedDialog = page.getByRole("dialog");
    const retryReconcileButton = resumedDialog.getByRole("button", {
      name: "Consultar operaci\u00f3n",
    });
    await expect(retryReconcileButton).toBeVisible();
    const confirmedResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/rpc/get_business_operation") &&
        response.status() === 200,
    );
    await retryReconcileButton.click();
    await confirmedResponse;
    await expect(page.getByText("Compra reconciliada con el resultado persistido")).toBeVisible();
    expect(reconciliationRequests).toBe(2);
    expect(postPurchaseRequests).toBe(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(
      await page.evaluate(
        (id) => sessionStorage.getItem(`grace.pending-business-operation.v1:${id}`),
        identityId,
      ),
    ).toBeNull();
  });

  test("separate authenticated tabs do not share idle activity between identities", async ({
    page,
    context,
  }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/login");
    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel(/Contrase/).fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible({
      timeout: 20_000,
    });

    const otherTab = await context.newPage();
    await otherTab.goto("/login");
    await otherTab.getByLabel("Usuario").fill(usernameB);
    await otherTab.getByLabel(/Contrase/).fill(passwordB);
    const secondLoginResponse = otherTab.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith("/functions/v1/username-login"),
    );
    await otherTab.getByRole("button", { name: "Entrar al sistema" }).click();
    const secondLoginStatus = (await secondLoginResponse).status();
    expect(secondLoginStatus, "synthetic second identity login response").toBe(200);
    await expect(otherTab.getByRole("button", { name: "Cerrar sesión" })).toBeVisible({
      timeout: 20_000,
    });

    const oldActivity = await page.evaluate((id) => {
      const key = `grace.idle.last-activity.v1:${id}`;
      const old = String(Date.now() - 115 * 60_000);
      sessionStorage.setItem(key, old);
      return old;
    }, identityId);
    await page.reload();
    await expect(page.getByRole("dialog")).toBeVisible();
    await otherTab.getByRole("link", { name: "Panel" }).click();
    await expect(otherTab.getByRole("dialog")).toHaveCount(0);
    const untouched = await page.evaluate(
      (id) => sessionStorage.getItem(`grace.idle.last-activity.v1:${id}`),
      identityId,
    );
    expect(untouched).toBe(oldActivity);
    const adminTab = await context.newPage();
    await adminTab.goto("/login");
    await adminTab.getByLabel("Usuario").fill(adminUsername);
    await adminTab.getByLabel(/Contrase/).fill(adminPassword);
    await adminTab.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(adminTab.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toBeVisible({
      timeout: 20_000,
    });
    await adminTab.getByRole("link", { name: "Empleados" }).click();
    const employeeRow = adminTab.getByRole("row").filter({ hasText: `@${username}` });
    await employeeRow.getByRole("button", { name: /ver detalles/i }).click();
    await adminTab
      .getByRole("dialog")
      .getByRole("button", { name: /revocar acceso/i })
      .click();
    const revokeDialog = adminTab.getByRole("alertdialog");
    const revokedUserResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith("/auth/v1/user"),
    );
    await revokeDialog.getByRole("button", { name: "Revocar acceso" }).click();
    await expect(adminTab.getByText("Acceso revocado.")).toBeVisible();
    await page.bringToFront();
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    expect((await revokedUserResponse).status()).toBe(403);
    const idleWarning = page.getByRole("dialog");
    await expect(idleWarning).toHaveCount(0);
    await expect(page.locator('[data-idle-continue="true"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Compras" })).toHaveCount(0);
    await expect(otherTab.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    const retryLogin = page.getByRole("button", { name: "Entrar al sistema" });
    await expect(retryLogin).toBeEnabled();
    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel(/Contrase/).fill(password);
    await retryLogin.click();
    await expect(page.getByText(/Usuario o contrase\u00f1a inv\u00e1lidos/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Cerrar sesi\u00f3n" })).toHaveCount(0);
    await adminTab.close();
    await otherTab.close();
    expect(pageErrors).toEqual([]);
  });
});
