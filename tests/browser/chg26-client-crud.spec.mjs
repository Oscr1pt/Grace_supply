import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const adminUsername = `chg26_admin_${suffix}`;
const adminEmail = `${adminUsername}@example.test`;
const adminPassword = `Admin-${crypto.randomUUID()}-Aa1!`;
function validCedula() {
  const digits = crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 10)
    .split("")
    .map((char) => Number.parseInt(char, 16) % 10);
  if (digits.every((digit) => digit === digits[0])) digits[0] = (digits[0] + 1) % 10;
  const sum = digits.reduce((total, digit, index) => {
    const product = digit * (index % 2 === 0 ? 1 : 2);
    return total + (product > 9 ? product - 9 : product);
  }, 0);
  return `${digits.join("")}${(10 - (sum % 10)) % 10}`;
}
const primaryDocument = validCedula();
const duplicateDocument = validCedula();
const homonymDocument = validCedula();
const homonymSecondDocument = validCedula();
const failedDocument = validCedula();
const createdClientIds = [];
let service;

function assertNoError(error) {
  if (error) throw error;
}

async function loginAsAdmin(page) {
  await page.goto("/team/new", { waitUntil: "domcontentloaded", timeout: 10_000 });
  await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
  await page.getByLabel("Usuario").fill(adminUsername);
  await page.getByLabel(/contrase/i).fill(adminPassword);
  await page.getByRole("button", { name: /entrar al sistema/i }).click();
  await expect(page).toHaveURL(/\/dashboard(?:$|\?)/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Panel General" })).toBeVisible({
    timeout: 15_000,
  });
  await page.goto("/clients", { waitUntil: "domcontentloaded", timeout: 10_000 });
  try {
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible({ timeout: 15_000 });
  } catch {
    throw new Error(
      `clients route unavailable: ${JSON.stringify({
        url: page.url(),
        text: (await page.locator("body").innerText()).slice(0, 500),
      })}`,
    );
  }
}

test.describe.serial("CHG-26 client identity reliability", () => {
  test.setTimeout(90_000);

  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey) throw new Error("Supabase local es obligatorio");
    if (
      ![url].every((value) => ["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname))
    ) {
      throw new Error("CHG-26 rechaza destinos que no sean locales");
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
    const profile = await service.from("user_profiles").insert({
      auth_user_id: identity.data.user.id,
      username: adminUsername,
      name: "CHG-26 synthetic administrator",
      role: "admin",
      permissions: ["dashboard", "clients"],
      active: true,
    });
    assertNoError(profile.error);
  });

  test.afterAll(async () => {
    if (!service) return;
    if (createdClientIds.length) await service.from("clients").delete().in("id", createdClientIds);
    const residue = await service.from("clients").select("id").ilike("name", `CHG26%${suffix}%`);
    if (!residue.error && residue.data?.length) {
      await service
        .from("clients")
        .delete()
        .in(
          "id",
          residue.data.map((row) => row.id),
        );
    }
    const profile = await service
      .from("user_profiles")
      .select("auth_user_id")
      .eq("normalized_username", adminUsername)
      .maybeSingle();
    if (profile.data?.auth_user_id) {
      await service.from("user_profiles").delete().eq("auth_user_id", profile.data.auth_user_id);
      await service.auth.admin.deleteUser(profile.data.auth_user_id);
    }
  });

  test("creates and edits a client without sending generated fields", async ({ page }) => {
    await loginAsAdmin(page);

    const name = `CHG26 Cliente ${suffix}`;
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page.getByLabel("Nombre o razón social").fill(name);
    await page.getByLabel("RNC / Cédula").fill(primaryDocument);
    await page.getByLabel("Correo electrónico").fill(`${suffix}@example.test`);
    await page.getByLabel("Teléfono Principal").fill("809-555-0199");
    await page.getByRole("button", { name: "Agregar cliente" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText(name, { exact: true })).toBeVisible();

    const row = page.locator("tr").filter({ hasText: name });
    await row.getByRole("button", { name: `Editar cliente ${name}` }).click();
    await page.getByLabel("Nombre o razón social").fill(`${name} editado`);
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText(`${name} editado`)).toBeVisible();

    const saved = await service
      .from("clients")
      .select("id,rnc_normalized")
      .ilike("name", `${name} editado`)
      .single();
    assertNoError(saved.error);
    createdClientIds.push(saved.data.id);
    expect(saved.data.rnc_normalized).toBe(primaryDocument);
  });

  test("rejects empty, invalid, and duplicate documents while warning on homonyms", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page.getByLabel("Nombre o razón social").fill(`CHG26 inválido ${suffix}`);
    await page.getByRole("button", { name: "Agregar cliente" }).click();
    await expect(page.getByText(/cédula o RNC válido/i)).toBeVisible();
    await page.getByLabel("RNC / Cédula").fill("texto inválido");
    await page.getByRole("button", { name: "Agregar cliente" }).click();
    await expect(page.getByText(/cédula de 11 dígitos|RNC de 9 dígitos/i)).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();

    const duplicateName = `CHG26 duplicado ${suffix}`;
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page.getByLabel("Nombre o razón social").fill(duplicateName);
    await page.getByLabel("RNC / Cédula").fill(duplicateDocument);
    await page.getByRole("button", { name: "Agregar cliente" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText(duplicateName, { exact: true })).toBeVisible();
    const duplicate = await service
      .from("clients")
      .select("id")
      .ilike("name", duplicateName)
      .single();
    assertNoError(duplicate.error);
    createdClientIds.push(duplicate.data.id);

    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page.getByLabel("Nombre o razón social").fill(`CHG26 otro ${suffix}`);
    await page.getByLabel("RNC / Cédula").fill(duplicateDocument);
    await page.getByRole("button", { name: "Agregar cliente" }).click();
    await expect(page.getByText(/documento ya pertenece/i)).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();

    const homonym = `CHG26 Homónimo ${suffix}`;
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page.getByLabel("Nombre o razón social").fill(homonym);
    await page.getByLabel("RNC / Cédula").fill(homonymDocument);
    await page.getByRole("button", { name: "Agregar cliente" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText(homonym, { exact: true })).toBeVisible();
    const firstHomonym = await service.from("clients").select("id").ilike("name", homonym).single();
    assertNoError(firstHomonym.error);
    createdClientIds.push(firstHomonym.data.id);

    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page.getByLabel("Nombre o razón social").fill(homonym);
    await page.getByLabel("RNC / Cédula").fill(homonymSecondDocument);
    await expect(page.getByText(/coincidencias de nombre/i)).toBeVisible();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Agregar cliente" }).click();
    await expect(page.getByText(homonym)).toHaveCount(2);
  });

  test("preserves the form after a failed client write", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    const name = `CHG26 fallo ${suffix}`;
    await page.getByLabel("Nombre o razón social").fill(name);
    await page.getByLabel("RNC / Cédula").fill(failedDocument);
    await page.route("**/rest/v1/clients*", async (route, request) => {
      if (request.method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "synthetic failure" }),
        });
      } else {
        await route.continue();
      }
    });
    await page.getByRole("button", { name: "Agregar cliente" }).click();
    await expect(page.getByText("No se guardó el cliente.")).toBeVisible();
    await expect(page.getByLabel("Nombre o razón social")).toHaveValue(name);
    await expect(page.getByLabel("RNC / Cédula")).toHaveValue(failedDocument);
    await page.unroute("**/rest/v1/clients*");
  });
});
