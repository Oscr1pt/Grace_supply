import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.CHG39_DISPOSABLE_TESTS === "1";
const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const container = process.env.LOCAL_SUPABASE_CONTAINER;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const identity = {
  username: `chg39-client-${suffix}`,
  email: `chg39-client-${suffix}@example.test`,
  password: `Client-${crypto.randomUUID()}-9c!`,
};
const firstName = `CHG39 cliente sin documento ${suffix}`;
const secondName = `CHG39 segundo cliente sin documento ${suffix}`;
const invalidName = `CHG39 documento inválido ${suffix}`;
const duplicateName = `CHG39 documento duplicado ${suffix}`;
let service;
let authUserId;
const clientIds = [];

test.describe.serial("CHG-39 optional client document", () => {
  test.skip(!enabled, "Client form tests require the dedicated disposable CHG-39 Supabase stack.");

  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey || !container) {
      throw new Error("CHG-39 requires explicit local Supabase metadata.");
    }
    const target = new URL(url);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) {
      throw new Error("CHG-39 refuses non-loopback Supabase URLs.");
    }
    if (!/^supabase_db_gracechg39[a-z0-9]+$/.test(container)) {
      throw new Error("CHG-39 refuses a database not dedicated to this disposable test.");
    }

    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const created = await service.auth.admin.createUser({
      email: identity.email,
      password: identity.password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    authUserId = created.data.user.id;
    const profile = await service.from("user_profiles").insert({
      auth_user_id: authUserId,
      username: identity.username,
      name: "Synthetic CHG-39 client operator",
      role: "employee",
      permissions: ["dashboard", "clients"],
      active: true,
    });
    if (profile.error) throw profile.error;
  });

  test.afterAll(async () => {
    if (!service) return;
    if (clientIds.length) {
      const { error } = await service.from("clients").delete().in("id", clientIds);
      if (error) throw new Error(`Synthetic client cleanup failed (${error.code ?? "unknown"}).`);
    }
    if (authUserId) {
      const { error: profileError } = await service
        .from("user_profiles")
        .delete()
        .eq("auth_user_id", authUserId);
      if (profileError) {
        throw new Error(`Synthetic profile cleanup failed (${profileError.code ?? "unknown"}).`);
      }
      const deleted = await service.auth.admin.deleteUser(authUserId);
      if (deleted.error) {
        throw new Error(`Synthetic auth cleanup failed (${deleted.error.status ?? "unknown"}).`);
      }
    }
  });

  async function login(page) {
    await page.goto("/login");
    const submit = page.getByRole("button", { name: "Entrar al sistema" });
    await expect(submit).toBeEnabled();
    await page.getByLabel("Usuario").fill(identity.username);
    await page.getByLabel("Contraseña").fill(identity.password);
    const loginResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith("/functions/v1/username-login"),
    );
    await submit.click();
    const response = await loginResponse;
    if (!response.ok())
      throw new Error(`Synthetic username-login returned HTTP ${response.status()}.`);
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  }

  async function createClientWithoutDocument(page, name) {
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page.getByLabel("Nombre o razón social").fill(name);
    const document = page.getByLabel("RNC / Cédula (opcional)");
    await expect(document).toHaveAttribute("placeholder", "Puedes agregarlo después");
    const insertResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/rest/v1/clients") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Agregar cliente" }).click();
    await expect(page.getByText("Cliente agregado").last()).toBeVisible();
    const saved = await insertResponse;
    expect(saved.ok(), `Client insert returned HTTP ${saved.status()}.`).toBe(true);
    const insertedRows = await saved.json();
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({ name, rnc: null, rnc_normalized: null });
    const result = await service
      .from("clients")
      .select("id,rnc,rnc_normalized")
      .eq("id", insertedRows[0].id)
      .single();
    expect(result.error).toBeNull();
    expect(result.data.rnc).toBeNull();
    expect(result.data.rnc_normalized).toBeNull();
    clientIds.push(result.data.id);
    return result.data;
  }

  test("creates clients without documents and supports later completion and integrity checks", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/clients");

    const first = await createClientWithoutDocument(page, firstName);
    const second = await createClientWithoutDocument(page, secondName);
    expect(second.id).not.toBe(first.id);

    await page.getByRole("button", { name: `Editar cliente ${firstName}` }).click();
    await page.getByLabel("RNC / Cédula (opcional)").fill("001-1234567-3");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Cliente actualizado")).toBeVisible();
    const completed = await service
      .from("clients")
      .select("id,rnc,rnc_normalized")
      .eq("id", first.id)
      .single();
    expect(completed.error).toBeNull();
    expect(completed.data).toEqual({
      id: first.id,
      rnc: "00112345673",
      rnc_normalized: "00112345673",
    });

    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page.getByLabel("Nombre o razón social").fill(invalidName);
    await page.getByLabel("RNC / Cédula (opcional)").fill("40219994058");
    await page.getByRole("button", { name: "Agregar cliente" }).click();
    await expect(
      page.getByText(/Escribe una cédula de 11 dígitos o un RNC de 9 dígitos válido/),
    ).toBeVisible();
    expect(
      await service.from("clients").select("id").eq("name", invalidName).maybeSingle(),
    ).toMatchObject({ data: null, error: null });
    await page.getByRole("button", { name: "Cancelar" }).click();

    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page.getByLabel("Nombre o razón social").fill(duplicateName);
    await page.getByLabel("RNC / Cédula (opcional)").fill("00112345673");
    await page.getByRole("button", { name: "Agregar cliente" }).click();
    await expect(page.getByText(/Este documento ya pertenece a otro cliente/)).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();

    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page.getByLabel("Nombre o razón social").fill(firstName);
    await expect(page.getByText(/Confirmo que se trata de otra persona distinta\./)).toBeVisible();
    await expect(page.getByText(/el documento es diferente/i)).toHaveCount(0);
    await page.locator("#client-homonym-warning").locator("xpath=preceding-sibling::input").check();
    const homonymResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/rest/v1/clients") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Agregar cliente" }).click();
    await expect(page.getByText("Cliente agregado").last()).toBeVisible();
    const response = await homonymResponse;
    expect(response.ok(), `Homonym insert returned HTTP ${response.status()}.`).toBe(true);
    const [homonym] = await response.json();
    expect(homonym).toMatchObject({ name: firstName, rnc: null, rnc_normalized: null });
    clientIds.push(homonym.id);
  });
});
