import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const adminPassword = `CHG21-${crypto.randomUUID()}-Aa1!`;
const identities = [];
const employeeUsernames = [];
let service;
let admin;

const allPermissions = [
  "dashboard",
  "clients",
  "suppliers",
  "inventory",
  "sales",
  "purchases",
  "expenses",
  "settings",
];

test.describe("CHG-21 employee account and access usability", () => {
  test.setTimeout(60000);

  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey)
      throw new Error("A disposable local Supabase project is required");
    if (!["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
      throw new Error("CHG-21 browser tests refuse non-local Supabase targets");
    }
    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    admin = await addAccount("admin", true, true, "admin");
    await addAccount("active", true, true, "employee");
    await addAccount("pending", false, false, "employee");
  });

  test.afterAll(async () => {
    for (const identity of identities) {
      await service.from("user_profiles").delete().eq("auth_user_id", identity.id);
      await service.auth.admin.deleteUser(identity.id);
    }
  });

  async function addAccount(label, confirmed, active, role) {
    const email = `chg21-${label}-${suffix}@example.test`;
    const username = `chg21_${label}_${suffix}`;
    const password = label === "admin" ? adminPassword : `Test-${crypto.randomUUID()}-Bb2!`;
    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: confirmed,
    });
    assertNoError(created.error);
    const identity = created.data.user;
    identities.push(identity);
    employeeUsernames.push(username);
    const profile = await service.from("user_profiles").insert({
      auth_user_id: identity.id,
      username,
      name: `CHG-21 ${label} ${suffix}`,
      role,
      permissions: role === "admin" ? allPermissions : ["sales"],
      active,
    });
    assertNoError(profile.error);
    return { email, username, password, identity };
  }

  function assertNoError(error) {
    if (error) throw new Error(`Local synthetic fixture failed (${error.code ?? "no-code"})`);
  }

  async function signInAsAdmin(page) {
    await page.goto("/login");
    const loginButton = page.getByRole("button", { name: /entrar al sistema/i });
    await expect(loginButton).toBeEnabled({ timeout: 12000 });
    await page.getByLabel("Usuario").fill(admin.username);
    await page.getByLabel("Contraseña").fill(admin.password);
    await loginButton.click();
    await expect(page).toHaveURL(/\/dashboard(?:$|\?)/, { timeout: 12000 });
    await page.goto("/team");
    await expect(page.getByRole("heading", { name: "Empleados" })).toBeVisible();
  }

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

  test("una sesión vacía se resuelve y la pantalla de empleados muestra estados y errores reales", async ({
    page,
  }) => {
    await signInAsAdmin(page);
    const pendingRow = page.getByRole("row").filter({ hasText: `@chg21_pending_${suffix}` });
    const pendingIdentity = await service.auth.admin.getUserById(identities[2].id);
    assertNoError(pendingIdentity.error);
    const confirmedAt = pendingIdentity.data.user.email_confirmed_at;
    const expectedStatus = confirmedAt === null ? "Pendiente de correo" : "Cuenta inactiva";
    await expect(pendingRow.getByText(expectedStatus)).toBeVisible();
    if (confirmedAt !== null) {
      await expect(pendingRow.getByText("Pendiente de correo")).toHaveCount(0);
    }
    await pendingRow.getByRole("button", { name: /ver detalles/i }).click();
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Activar acceso" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole("heading", { name: "Empleados" })).toBeVisible();
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, `page should not overflow at ${width}px`).toBeLessThanOrEqual(width);
    }
  });

  test("el servidor rechaza activar correo no confirmado y acepta la activación tras confirmarlo", async ({
    page,
  }) => {
    await signInAsAdmin(page);
    const pendingRow = page.getByRole("row").filter({ hasText: `@chg21_pending_${suffix}` });
    await pendingRow.getByRole("button", { name: /ver detalles/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Activar acceso" }).click();
    const activationDialog = page.getByRole("alertdialog");
    await expect(activationDialog).toContainText(/verificará la configuración de contraseña/i);
    await page.keyboard.press("Escape");
    await expect(activationDialog).toBeHidden();
    const profileBefore = await service
      .from("user_profiles")
      .select("active")
      .eq("username", `chg21_pending_${suffix}`)
      .single();
    assertNoError(profileBefore.error);
    expect(profileBefore.data.active).toBe(false);

    await page.getByRole("dialog").getByRole("button", { name: "Activar acceso" }).click();
    const deniedActivationPromise = waitForManageProfile(
      page,
      "activate",
      `chg21_pending_${suffix}`,
      409,
    );
    await activationDialog.getByRole("button", { name: "Activar acceso" }).click();
    const deniedActivation = await deniedActivationPromise;
    expect((await deniedActivation.json()).error).toMatch(/correo confirmado/i);
    await expect(page.getByText(/servidor no pudo confirmar la activación/i)).toBeVisible();
    const profileRejected = await service
      .from("user_profiles")
      .select("active")
      .eq("username", `chg21_pending_${suffix}`)
      .single();
    assertNoError(profileRejected.error);
    expect(profileRejected.data.active).toBe(false);

    // Keep the denied server result visible until the administrator dismisses it.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toBeHidden();

    const confirmed = await service.auth.admin.updateUserById(identities[2].id, {
      email_confirm: true,
    });
    assertNoError(confirmed.error);
    const profileAfterConfirmation = await service
      .from("user_profiles")
      .select("active")
      .eq("username", `chg21_pending_${suffix}`)
      .single();
    assertNoError(profileAfterConfirmation.error);
    expect(profileAfterConfirmation.data.active).toBe(false);
    await page.getByRole("dialog").getByRole("button", { name: "Activar acceso" }).click();
    const activatedPromise = waitForManageProfile(page, "activate", `chg21_pending_${suffix}`);
    await activationDialog.getByRole("button", { name: "Activar acceso" }).click();
    const activatedResponse = await activatedPromise;
    expect((await activatedResponse.json()).profile.active).toBe(true);
    await expect
      .poll(async () => {
        const result = await service
          .from("user_profiles")
          .select("active")
          .eq("username", `chg21_pending_${suffix}`)
          .single();
        assertNoError(result.error);
        return result.data.active;
      })
      .toBe(true);
    const profileActivated = await service
      .from("user_profiles")
      .select("active")
      .eq("username", `chg21_pending_${suffix}`)
      .single();
    assertNoError(profileActivated.error);
    expect(profileActivated.data.active).toBe(true);
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: `@chg21_pending_${suffix}` })
        .getByText("Cuenta activa"),
    ).toBeVisible();
  });

  test("los cambios de rol y revocación piden confirmación accesible y persisten", async ({
    page,
  }) => {
    await signInAsAdmin(page);
    const activeRow = page.getByRole("row").filter({ hasText: `@chg21_active_${suffix}` });
    await activeRow.getByRole("button", { name: /ver detalles/i }).click();
    const employeeDialog = page.getByRole("dialog");
    const roleSelect = employeeDialog.getByRole("combobox", { name: "Rol" });

    await roleSelect.click();
    await page.getByRole("option", { name: "Administrador" }).click();
    await employeeDialog.getByRole("button", { name: "Guardar cambios" }).click();
    const roleDialog = page.getByRole("alertdialog");
    await expect(
      roleDialog.getByRole("heading", { name: "¿Asignar rol administrador?" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(roleDialog).toBeHidden();
    const roleUnchanged = await service
      .from("user_profiles")
      .select("role")
      .eq("username", `chg21_active_${suffix}`)
      .single();
    assertNoError(roleUnchanged.error);
    expect(roleUnchanged.data.role).toBe("employee");

    await roleSelect.click();
    await page.getByRole("option", { name: "Empleado" }).click();
    await roleSelect.click();
    await page.getByRole("option", { name: "Administrador" }).click();
    await employeeDialog.getByRole("button", { name: "Guardar cambios" }).click();
    await roleDialog.getByRole("button", { name: "Confirmar cambio" }).click();
    await expect(page.getByText("Rol y permisos actualizados.")).toBeVisible();
    const rolePersisted = await service
      .from("user_profiles")
      .select("role,permissions")
      .eq("username", `chg21_active_${suffix}`)
      .single();
    assertNoError(rolePersisted.error);
    expect(rolePersisted.data.role).toBe("admin");
    expect(rolePersisted.data.permissions).toEqual(allPermissions);

    const adminRow = page.getByRole("row").filter({ hasText: `@chg21_active_${suffix}` });
    await adminRow.getByRole("button", { name: /ver detalles/i }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /revocar acceso/i })
      .click();
    const revokeDialog = page.getByRole("alertdialog");
    await expect(revokeDialog).toContainText(/sus registros se conservarán/i);
    await revokeDialog.getByRole("button", { name: "Cancelar" }).click();
    const activeAfterCancel = await service
      .from("user_profiles")
      .select("active")
      .eq("username", `chg21_active_${suffix}`)
      .single();
    assertNoError(activeAfterCancel.error);
    expect(activeAfterCancel.data.active).toBe(true);

    await page
      .getByRole("dialog")
      .getByRole("button", { name: /revocar acceso/i })
      .click();
    const revokePromise = waitForManageProfile(page, "revoke", `chg21_active_${suffix}`);
    await revokeDialog.getByRole("button", { name: "Revocar acceso" }).click();
    const revokeResponse = await revokePromise;
    expect((await revokeResponse.json()).profile.active).toBe(false);
    await expect(page.getByText("Acceso revocado.")).toBeVisible();
    await expect
      .poll(async () => {
        const result = await service
          .from("user_profiles")
          .select("active")
          .eq("username", `chg21_active_${suffix}`)
          .single();
        assertNoError(result.error);
        return result.data.active;
      })
      .toBe(false);
    const revoked = await service
      .from("user_profiles")
      .select("active")
      .eq("username", `chg21_active_${suffix}`)
      .single();
    assertNoError(revoked.error);
    expect(revoked.data.active).toBe(false);
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: `@chg21_active_${suffix}` })
        .getByText("Cuenta inactiva"),
    ).toBeVisible();
  });

  test("la recuperación pública por correo está deshabilitada y remite al proceso asistido", async ({
    page,
  }) => {
    const recoveryRequests = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith("/functions/v1/username-recovery")) {
        recoveryRequests.push(request.url());
      }
    });
    await page.goto("/recover");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Recuperar acceso" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
      /recuperación automática por correo está deshabilitada/i,
    );
    await expect(page.getByText(/administrador.*enlace privado/i)).toBeVisible();
    await expect(page.getByLabel("Usuario")).toHaveCount(0);
    expect(recoveryRequests).toHaveLength(0);
  });
});
