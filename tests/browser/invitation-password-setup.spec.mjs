import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const authStorageKey = url ? `sb-${new URL(url).hostname.split(".")[0]}-auth-token` : "supabase.auth.token";
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const mailpit = process.env.LOCAL_MAILPIT_URL;
const origin = "http://127.0.0.1:5174";
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const accounts = [];
let service;

test.describe("Auth invitation and initial password setup", () => {
  test.setTimeout(60000);
  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey || !mailpit) throw new Error("Disposable local Supabase and Mailpit are required");
    if (!["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
      throw new Error("Invitation password tests refuse a non-local Supabase target");
    }
    service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  });

  test.afterAll(async () => {
    for (const account of accounts) {
      await service.from("user_profiles").delete().eq("auth_user_id", account.id);
      await service.auth.admin.deleteUser(account.id);
    }
  });

  async function createBootstrapIdentity(label) {
    const email = `invite-${label}-${suffix}@example.test`;
    const username = `invite_${label}_${suffix}`;
    const invite = await service.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/reset-password` });
    assertNoError(invite.error);
    const identity = invite.data.user;
    accounts.push(identity);
    const profile = await service.from("user_profiles").insert({
      auth_user_id: identity.id,
      username,
      name: `Synthetic ${label} administrator`,
      role: "admin",
      permissions: ["dashboard", "clients", "suppliers", "inventory", "sales", "purchases", "expenses", "settings"],
      active: false,
    });
    assertNoError(profile.error);
    return { email, username, identity };
  }

  async function mailLink(email, type) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const response = await fetch(`${mailpit}/api/v1/messages`);
      expect(response.ok).toBeTruthy();
      const { messages = [] } = await response.json();
      for (const message of messages.filter((item) => item.To?.some((recipient) => recipient.Address === email))) {
        const id = message.ID ?? message.Id ?? message.id;
        const detailResponse = await fetch(`${mailpit}/api/v1/message/${encodeURIComponent(id)}`);
        expect(detailResponse.ok).toBeTruthy();
        const detail = await detailResponse.json();
        for (const body of [detail.Text, detail.HTML]) {
          if (typeof body !== "string") continue;
          for (const match of body.matchAll(/https?:\/\/[^\s"<>]+/g)) {
            const link = new URL(match[0].replaceAll("&amp;", "&"));
            if (link.pathname === "/auth/v1/verify" && link.searchParams.get("type") === type) return link.toString();
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Auth ${type} email did not arrive in local Mailpit`);
  }

  function assertNoError(error) {
    if (error) throw error;
  }

  async function setPassword(page, password) {
    const authOperationOrder = [];
    const authResponses = [];
    page.on("response", (response) => {
      const requestUrl = new URL(response.url());
      const method = response.request().method();
      if (requestUrl.pathname.startsWith("/auth/v1/")) {
        authResponses.push({ path: requestUrl.pathname, method, status: response.status() });
      }
      if (requestUrl.pathname === "/auth/v1/user" && method === "PUT" && response.ok()) authOperationOrder.push("updateUser");
      if (requestUrl.pathname === "/auth/v1/logout" && method === "POST" && response.ok()) authOperationOrder.push("signOut");
    });
    await expect(page).toHaveURL(/\/reset-password/);
    await expect(page.getByRole("heading", { name: /contraseña/i })).toBeVisible();
    await expect(page.getByLabel(/nueva/i)).toBeVisible();
    const hasTemporaryAuthSession = await page.evaluate((sessionKey) => Object.keys(sessionStorage).includes(sessionKey), authStorageKey);
    expect(hasTemporaryAuthSession).toBe(true);
    const logoutResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/auth/v1/logout" && response.request().method() === "POST");
    await page.getByLabel("Contraseña nueva").fill(password);
    await page.getByLabel("Confirmar contraseña").fill(password);
    await page.getByRole("button", { name: /guardar contraseña/i }).click();
    try {
      await expect(page.getByRole("status")).toContainText(/contraseña.*guardada/i, { timeout: 15000 });
    } catch (error) {
      const alerts = await page.getByRole("alert").allTextContents();
      const formState = await page.evaluate(() => {
        const form = document.querySelector("form");
        const button = form?.querySelector("button");
        const fields = [...(form?.querySelectorAll("input") ?? [])];
        return {
          text: document.body.innerText,
          valid: form?.checkValidity(),
          fields: fields.map((field) => ({ length: field.value.length, valid: field.checkValidity() })),
          button: button ? { text: button.innerText, disabled: button.disabled } : null,
        };
      });
      throw new Error(`Password setup failed; alerts=${JSON.stringify(alerts)}; Auth responses=${JSON.stringify(authResponses)}; UI=${JSON.stringify(formState)}`, { cause: error });
    }
    await logoutResponse;
    expect(authOperationOrder.indexOf("updateUser")).toBeGreaterThanOrEqual(0);
    expect(authOperationOrder.indexOf("signOut")).toBeGreaterThan(authOperationOrder.indexOf("updateUser"));
    const hasSessionAfterCompletion = await page.evaluate((sessionKey) => Object.keys(sessionStorage).includes(sessionKey), authStorageKey);
    expect(hasSessionAfterCompletion).toBe(false);
  }

  test("invite confirmation retains the inactive bootstrap session long enough to set an Auth password", async ({ page }) => {
    const callbackLocations = [];
    const browserConsole = [];
    page.on("console", (message) => browserConsole.push(message.text()));
    page.on("framenavigated", (frame) => {
      const location = new URL(frame.url());
      if (location.pathname === "/reset-password") callbackLocations.push({
        origin: location.origin,
        queryKeys: [...location.searchParams.keys()],
        fragmentKeys: [...new URLSearchParams(location.hash.replace(/^#/, "")).keys()],
      });
    });
    const { email, identity } = await createBootstrapIdentity("first");
    const inviteLink = await mailLink(email, "invite");
    await page.goto(inviteLink);
    expect(callbackLocations.some((item) => item.fragmentKeys.includes("access_token") && item.fragmentKeys.includes("type"))).toBe(true);

    const newPassword = `Invite-${crypto.randomUUID()}-9a!`;
    await setPassword(page, newPassword);

    const profile = await service.from("user_profiles").select("active,role,auth_user_id").eq("auth_user_id", identity.id).single();
    assertNoError(profile.error);
    expect(profile.data).toEqual({ active: false, role: "admin", auth_user_id: identity.id });
    const login = await createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
      .auth.signInWithPassword({ email, password: newPassword });
    assertNoError(login.error);
    expect(login.data.user.id).toBe(identity.id);

    await page.goto("/login");
    await expect(page.getByRole("button", { name: /entrar al sistema/i })).toBeEnabled();
    await page.locator("#username").fill(`invite_first_${suffix}`);
    await page.locator("#password").fill(newPassword);
    expect(await page.locator("#username").inputValue()).toBe(`invite_first_${suffix}`);
    expect(await page.locator("#password").inputValue()).toBe(newPassword);
    await page.getByRole("button", { name: /entrar al sistema/i }).click();
    await expect(page.getByRole("alert")).toContainText(/inv.*lidos/i, { timeout: 15000 });
    await expect(page).toHaveURL(/\/login$/);
    expect(browserConsole.join("\n")).not.toMatch(/(?:access_token|refresh_token|token(?:_hash)?=)[^\s&]+/i);

    await page.goto(inviteLink);
    await expect(page.getByRole("alert")).toContainText(/venció|utilizado|no es válido/i);
  });

  test("a consumed invite can recover the same confirmed inactive admin without creating a duplicate identity", async ({ page }) => {
    const { email, username, identity } = await createBootstrapIdentity("resume");
    const inviteLink = await mailLink(email, "invite");
    const inviteAuth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const token = new URL(inviteLink).searchParams.get("token");
    expect(token).toBeTruthy();
    const accepted = await inviteAuth.auth.verifyOtp({ token_hash: token, type: "invite" });
    assertNoError(accepted.error);
    expect(accepted.data.user.id).toBe(identity.id);
    await inviteAuth.auth.signOut({ scope: "local" });

    const recovery = await createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
      .functions.invoke("username-recovery", { body: { username } });
    assertNoError(recovery.error);
    const recoveryLink = await mailLink(email, "recovery");
    await page.goto(recoveryLink);

    const newPassword = `Recovered-${crypto.randomUUID()}-9b!`;
    await setPassword(page, newPassword);
    const profile = await service.from("user_profiles").select("active,auth_user_id").eq("auth_user_id", identity.id).single();
    assertNoError(profile.error);
    expect(profile.data).toEqual({ active: false, auth_user_id: identity.id });
    const login = await createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
      .auth.signInWithPassword({ email, password: newPassword });
    assertNoError(login.error);
    expect(login.data.user.id).toBe(identity.id);

    const identities = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    assertNoError(identities.error);
    expect(identities.data.users.filter((user) => user.email === email)).toHaveLength(1);
  });

  test("PKCE callback exchanges its code in the browser and supports initial password setup", async ({ page }) => {
    const user = {
      id: `00000000-0000-4000-8000-${suffix.padEnd(12, "0")}`,
      aud: "authenticated",
      role: "authenticated",
      email: `pkce-${suffix}@example.test`,
      email_confirmed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
    };
    let exchanged = false;
    let updatedPassword;
    await page.addInitScript((keyPrefix) => {
      sessionStorage.setItem(`${keyPrefix}-code-verifier`, JSON.stringify("browser-pkce-verifier/invite"));
    }, authStorageKey);
    await page.route(`${url}/auth/v1/token**`, async (route) => {
      if (!route.request().url().includes("grant_type=pkce")) return route.continue();
      const requestBody = route.request().postDataJSON();
      expect(requestBody.auth_code).toBe("browser-pkce-code");
      expect(requestBody.code_verifier).toBe("browser-pkce-verifier");
      exchanged = true;
      await route.fulfill({ json: {
        access_token: "browser-pkce-access-token",
        refresh_token: "browser-pkce-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        user,
      } });
    });
    await page.route(`${url}/auth/v1/user**`, async (route) => {
      if (route.request().method() === "PUT") {
        updatedPassword = route.request().postDataJSON().password;
        await route.fulfill({ json: { ...user, updated_at: new Date().toISOString() } });
      } else if (route.request().method() === "GET") {
        await route.fulfill({ json: user });
      } else {
        await route.continue();
      }
    });
    await page.route(`${url}/rest/v1/user_profiles**`, (route) => route.fulfill({ json: [], headers: { "content-range": "*/0" } }));
    await page.route(`${url}/auth/v1/logout**`, (route) => route.fulfill({ status: 204 }));

    await page.goto("/login?code=browser-pkce-code", { waitUntil: "domcontentloaded" });
    const newPassword = `PKCE-${crypto.randomUUID()}-9c!`;
    await setPassword(page, newPassword);
    expect(exchanged).toBe(true);
    expect(updatedPassword).toBe(newPassword);
  });

  test("expired or invalid callback errors do not reuse an unrelated stored session", async ({ page }) => {
    await page.goto("/reset-password?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    await expect(page.getByRole("alert")).toContainText(/venció|utilizado|no es válido/i);
    await expect(page.getByRole("alert")).toContainText(/debe reemplazarse por uno nuevo/i);
  });
});
