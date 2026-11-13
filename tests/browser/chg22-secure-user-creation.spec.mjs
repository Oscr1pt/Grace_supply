import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const adminUsername = `chg22_admin_${suffix}`;
const adminEmail = `chg22-admin-${suffix}@example.test`;
const adminPassword = `Admin-${crypto.randomUUID()}-Aa1!`;
const created = [];
let service;

test.describe("CHG-22 secure user creation", () => {
  test.setTimeout(90000);

  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey) {
      throw new Error("A disposable local Supabase project is required");
    }
    if (
      ![url].every((value) => ["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname))
    ) {
      throw new Error("CHG-22 browser tests refuse non-local services");
    }
    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const identity = await service.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    });
    assertNoError(identity.error);
    created.push(identity.data.user.id);
    const profile = await service.from("user_profiles").insert({
      auth_user_id: identity.data.user.id,
      username: adminUsername,
      name: "CHG-22 synthetic administrator",
      phone: "+1 809 555 0100",
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
    assertNoError(profile.error);
  });

  test.afterAll(async () => {
    if (!service) return;
    const username = `chg22_employee_${suffix}`;
    const profile = await service
      .from("user_profiles")
      .select("auth_user_id")
      .eq("normalized_username", username)
      .maybeSingle();
    if (profile.data?.auth_user_id) {
      await service.from("user_profiles").delete().eq("auth_user_id", profile.data.auth_user_id);
      await service.auth.admin.deleteUser(profile.data.auth_user_id);
    }
    for (const id of created) {
      await service.from("user_profiles").delete().eq("auth_user_id", id);
      await service.auth.admin.deleteUser(id);
    }
  });

  async function waitForManageProfile(page, action, username, status = 200) {
    const response = await page.waitForResponse(
      (candidate) => {
        const request = candidate.request();
        if (
          request.method() !== "POST" ||
          new URL(candidate.url()).pathname !== "/functions/v1/manage-profile"
        ) {
          return false;
        }
        try {
          const body = request.postDataJSON();
          return body.action === action && body.username === username;
        } catch {
          return false;
        }
      },
      { timeout: 15000 },
    );
    expect(response.status()).toBe(status);
    return response;
  }

  test("admin creates an inactive account, recipient changes the initial password, then access is activated", async ({
    page,
    browser,
  }) => {
    const username = `chg22_employee_${suffix}`;
    const email = `chg22-employee-${suffix}@example.test`;
    const newPassword = `Personal-${crypto.randomUUID()}-Cc3!`;

    await page.setViewportSize({ width: 320, height: 820 });
    await page.goto("/team/new");
    // Auth session initialization can finish after the protected route first renders.
    // Wait for its redirect condition rather than treating the initial loading state as a failure.
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
    await page.getByLabel("Usuario").fill(adminUsername);
    await page.getByLabel("Contraseña").fill(adminPassword);
    const loginResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/functions/v1/username-login",
      { timeout: 15_000 },
    );
    await page.getByRole("button", { name: /entrar al sistema/i }).click();
    try {
      expect((await loginResponse).status()).toBe(200);
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 15_000 }).toBe("/dashboard");
    } catch {
      const diagnostic = await page.evaluate(() => ({
        url: location.pathname,
        alerts: Array.from(document.querySelectorAll('[role="alert"]'), (node) => node.textContent),
        statuses: Array.from(
          document.querySelectorAll('[role="status"]'),
          (node) => node.textContent,
        ),
      }));
      throw new Error(
        `Synthetic administrator login did not complete: ${JSON.stringify(diagnostic)}`,
      );
    }
    await page.goto("/team/new");
    await expect(page.getByRole("heading", { name: "Crear usuario" })).toBeVisible();
    await expect(page.getByLabel("Usuario", { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Rol de la cuenta" })).toBeVisible();
    await page.getByLabel("Usuario", { exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Nombre", { exact: true })).toBeFocused();
    await page.getByLabel("Usuario", { exact: true }).fill(username);
    await page.getByLabel("Nombre", { exact: true }).fill("Synthetic CHG-22 employee");
    await page.getByLabel("Teléfono individual").fill("1234");
    await page.getByLabel("Correo individual").fill(email);
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(
      page.getByText("Escribe un teléfono válido con entre 7 y 15 dígitos."),
    ).toBeVisible();
    await expect(page.getByLabel("Teléfono individual")).toBeFocused();
    await page.getByLabel("Teléfono individual").fill("+1 (809) 555-0188");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("status")).toContainText(/perfil quedó creado e inactivo/i);
    const setupUrl = await page.getByLabel("Enlace temporal de configuración").inputValue();
    expect(setupUrl).toMatch(/^https?:\/\//);

    const saved = await service
      .from("user_profiles")
      .select("auth_user_id,active,password_change_required,phone,role")
      .eq("normalized_username", username)
      .single();
    assertNoError(saved.error);
    expect(saved.data).toMatchObject({
      active: false,
      password_change_required: true,
      phone: "+1 (809) 555-0188",
      role: "employee",
    });

    const recipientContext = await browser.newContext();
    const recipientPage = await recipientContext.newPage();
    try {
      await recipientPage.goto(setupUrl);
      await expect(recipientPage).toHaveURL(/\/setup-account/);
      await expect(
        recipientPage.getByRole("heading", { name: "Configura tu cuenta" }),
      ).toBeVisible();
      const passwordCompletion = recipientPage.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/functions/v1/complete-initial-password",
        { timeout: 20_000 },
      );
      await recipientPage.getByLabel("Contraseña personal nueva").fill(newPassword);
      await recipientPage.getByLabel("Confirmar contraseña").fill(newPassword);
      await recipientPage.getByRole("button", { name: "Guardar contraseña personal" }).click();
      const completionResponse = await passwordCompletion;
      expect(completionResponse.status()).toBe(200);
      expect(await completionResponse.json()).toMatchObject({ completed: true });
      await expect(recipientPage.getByRole("status")).toContainText(
        /contraseña personal quedó guardada/i,
      );

      const afterSetup = await service
        .from("user_profiles")
        .select("active,password_change_required")
        .eq("auth_user_id", saved.data.auth_user_id)
        .single();
      assertNoError(afterSetup.error);
      expect(afterSetup.data).toEqual({ active: false, password_change_required: false });
      const browserStorage = await recipientPage.evaluate(() =>
        [...Object.entries(localStorage), ...Object.entries(sessionStorage)]
          .map(([key, value]) => `${key}=${value}`)
          .join("\n"),
      );
      expect(browserStorage).not.toContain(newPassword);
      await expect
        .poll(() =>
          recipientPage.evaluate(() =>
            Object.keys(localStorage).every((key) => !key.endsWith("-auth-token")),
          ),
        )
        .toBe(true);
    } finally {
      await recipientContext.close();
    }

    await page.goto("/team");
    const employeeRow = page.getByRole("row").filter({ hasText: `@${username}` });
    await expect(employeeRow.getByText("Cuenta inactiva")).toBeVisible();
    await employeeRow.getByRole("button", { name: /ver detalles/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Activar acceso" }).click();
    const activationDialog = page.getByRole("alertdialog");
    const activationPromise = waitForManageProfile(page, "activate", username);
    await activationDialog.getByRole("button", { name: "Activar acceso" }).click();
    const activationResponse = await activationPromise;
    expect((await activationResponse.json()).profile.active).toBe(true);
    await expect
      .poll(async () => {
        const result = await service
          .from("user_profiles")
          .select("active")
          .eq("auth_user_id", saved.data.auth_user_id)
          .single();
        assertNoError(result.error);
        return result.data.active;
      })
      .toBe(true);
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: `@${username}` })
        .getByText("Cuenta activa"),
    ).toBeVisible();
    const active = await service
      .from("user_profiles")
      .select("active")
      .eq("auth_user_id", saved.data.auth_user_id)
      .single();
    assertNoError(active.error);
    expect(active.data.active).toBe(true);

    await page
      .getByRole("row")
      .filter({ hasText: `@${username}` })
      .getByRole("button", { name: /ver detalles/i })
      .click();
    const employeeDialog = page.getByRole("dialog");
    await employeeDialog.getByLabel("Nombre", { exact: true }).fill("CHG-22 edited employee");
    await employeeDialog.getByLabel("Teléfono", { exact: true }).fill("+1 809 555 0199");
    const editPromise = waitForManageProfile(page, "update", username);
    await employeeDialog.getByRole("button", { name: "Guardar cambios" }).click();
    const editResponse = await editPromise;
    expect((await editResponse.json()).profile).toMatchObject({
      name: "CHG-22 edited employee",
      phone: "+1 809 555 0199",
      role: "employee",
    });
    await expect(page.getByText("Cambios del empleado guardados.")).toBeVisible();
    const edited = await service
      .from("user_profiles")
      .select("name,phone,role")
      .eq("auth_user_id", saved.data.auth_user_id)
      .single();
    assertNoError(edited.error);
    expect(edited.data).toEqual({
      name: "CHG-22 edited employee",
      phone: "+1 809 555 0199",
      role: "employee",
    });
    await expect(page.getByText("Cambios del empleado guardados.")).toHaveCount(0, {
      timeout: 10_000,
    });

    const clientsPermission = employeeDialog.getByRole("checkbox", { name: "Clientes" });
    await clientsPermission.click();
    const permissionPromise = waitForManageProfile(page, "update", username);
    await employeeDialog.getByRole("button", { name: "Guardar cambios" }).click();
    const permissionResponse = await permissionPromise;
    expect((await permissionResponse.json()).profile.permissions).toContain("clients");
    await expect(page.getByText("Cambios del empleado guardados.")).toBeVisible();
    await expect
      .poll(async () => {
        const result = await service
          .from("user_profiles")
          .select("permissions")
          .eq("auth_user_id", saved.data.auth_user_id)
          .single();
        assertNoError(result.error);
        return result.data.permissions;
      })
      .toContain("clients");

    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, `no horizontal page overflow at ${width}px`).toBeLessThanOrEqual(width);
    }
  });

  test("an expired first-access link can return to login without opening private routes", async ({
    page,
  }) => {
    await page.goto("/setup-account?error=access_denied&error_code=otp_expired");
    await expect(page.getByRole("alert")).toContainText(/venció|utilizado|no es válido/i);
    await expect(page.getByLabel("Contraseña personal nueva")).toHaveCount(0);
    await page.getByRole("link", { name: "Volver al inicio de sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: /entrar al sistema/i })).toBeEnabled();
    await page.goto("/team/new");
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
  });

  function assertNoError(error) {
    if (error) throw new Error(`Local CHG-22 fixture failed (${error.code ?? "no-code"})`);
  }
});
