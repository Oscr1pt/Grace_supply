import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const mailpitUrl = process.env.LOCAL_MAILPIT_URL;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const adminUsername = `chg22_admin_${suffix}`;
const adminEmail = `chg22-admin-${suffix}@example.test`;
const adminPassword = `Admin-${crypto.randomUUID()}-Aa1!`;
const created = [];
let service;

test.describe("CHG-22 secure user creation", () => {
  test.setTimeout(90000);

  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey || !mailpitUrl) {
      throw new Error("A disposable local Supabase project and Mailpit are required");
    }
    if (
      ![url, mailpitUrl].every((value) =>
        ["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname),
      )
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

  test("admin creates an inactive account, recipient changes the initial password, then access is activated", async ({
    page,
    browser,
  }) => {
    const username = `chg22_employee_${suffix}`;
    const email = `chg22-employee-${suffix}@example.test`;
    const initialPassword = `Initial-${crypto.randomUUID()}-Bb2!`;
    const newPassword = `Personal-${crypto.randomUUID()}-Cc3!`;

    await page.setViewportSize({ width: 320, height: 820 });
    await page.goto("/team/new");
    // Auth session initialization can finish after the protected route first renders.
    // Wait for its redirect condition rather than treating the initial loading state as a failure.
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
    await page.getByLabel("Usuario").fill(adminUsername);
    await page.getByLabel("Contraseña").fill(adminPassword);
    await page.getByRole("button", { name: /entrar al sistema/i }).click();
    try {
      await expect(page).toHaveURL(/\/dashboard(?:$|\?)/);
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
    await page.getByLabel("Contraseña inicial", { exact: true }).fill(initialPassword);
    await page
      .getByLabel("Confirmar contraseña inicial", { exact: true })
      .fill("Mismatch-Password-123!");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(
      page.getByText("Escribe un teléfono válido con entre 7 y 15 dígitos."),
    ).toBeVisible();
    await expect(page.getByText("Las contraseñas no coinciden.")).toBeVisible();
    await expect(page.getByLabel("Teléfono individual")).toBeFocused();
    await page.getByLabel("Teléfono individual").fill("+1 (809) 555-0188");
    await page.getByLabel("Confirmar contraseña inicial", { exact: true }).fill(initialPassword);
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("status")).toContainText(/perfil quedó creado e inactivo/i);

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

    let inviteLink;
    const deadline = Date.now() + 15000;
    while (!inviteLink && Date.now() < deadline) {
      const inbox = await fetch(`${mailpitUrl}/api/v1/messages`);
      expect(inbox.ok).toBeTruthy();
      const { messages = [] } = await inbox.json();
      for (const message of messages.filter((item) =>
        item.To?.some((recipient) => recipient.Address === email),
      )) {
        const id = message.ID ?? message.Id ?? message.id;
        const detail = await fetch(`${mailpitUrl}/api/v1/message/${encodeURIComponent(id)}`);
        expect(detail.ok).toBeTruthy();
        const body = await detail.json();
        for (const content of [body.Text, body.HTML]) {
          if (typeof content !== "string") continue;
          for (const match of content.matchAll(/https?:\/\/[^\s"<>]+/g)) {
            const candidate = new URL(match[0].replaceAll("&amp;", "&"));
            if (
              candidate.pathname === "/auth/v1/verify" &&
              candidate.searchParams.get("type") === "invite"
            )
              inviteLink = candidate;
          }
        }
      }
      if (!inviteLink) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(inviteLink).toBeTruthy();
    const recipientContext = await browser.newContext();
    const recipientPage = await recipientContext.newPage();
    try {
      await recipientPage.goto(inviteLink.toString());
      await expect(recipientPage).toHaveURL(/\/setup-account/);
      await expect(
        recipientPage.getByRole("heading", { name: "Configura tu cuenta" }),
      ).toBeVisible();
      await recipientPage.getByLabel("Contraseña personal nueva").fill(newPassword);
      await recipientPage.getByLabel("Confirmar contraseña").fill(newPassword);
      await recipientPage.getByRole("button", { name: "Guardar contraseña personal" }).click();
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
      expect(browserStorage).not.toContain(initialPassword);
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
    const card = page.locator("article").filter({ hasText: `@${username}` });
    await expect(card.getByText("Cuenta inactiva")).toBeVisible();
    await card.getByRole("button", { name: "Activar cuenta" }).click();
    await page.getByRole("button", { name: "Confirmar activación" }).click();
    await expect(page.getByText(/servidor confirmó la activación/i)).toBeVisible();
    const active = await service
      .from("user_profiles")
      .select("active")
      .eq("auth_user_id", saved.data.auth_user_id)
      .single();
    assertNoError(active.error);
    expect(active.data.active).toBe(true);

    const editor = card.locator("form");
    await editor.getByLabel("Nombre", { exact: true }).fill("CHG-22 edited employee");
    await editor.getByLabel("Teléfono", { exact: true }).fill("+1 809 555 0199");
    await editor.getByRole("button", { name: "Guardar perfil" }).click();
    await expect(page.getByText("El servidor confirmó los datos del perfil.")).toBeVisible();
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

    const clientsPermission = card.getByRole("checkbox", { name: "Clientes" });
    await clientsPermission.click();
    await expect(page.getByText("Permisos actualizados.")).toBeVisible();
    const permissions = await service
      .from("user_profiles")
      .select("permissions")
      .eq("auth_user_id", saved.data.auth_user_id)
      .single();
    assertNoError(permissions.error);
    expect(permissions.data.permissions).toContain("clients");

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
