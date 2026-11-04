import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const username = `chg27-${suffix}`;
const email = `${username}@example.test`;
const password = `Inventory-${crypto.randomUUID()}-9a!`;
let service;
let userId;
const productIds = [];

test.describe.serial("CHG-27 product initial stock", () => {
  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey) throw new Error("Local Supabase is required");
    service = createClient(url, serviceKey, { auth: { persistSession: false } });
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    userId = created.data.user.id;
    const profile = await service.from("user_profiles").insert({
      auth_user_id: userId,
      username,
      name: "Synthetic CHG-27 operator",
      role: "admin",
      permissions: ["dashboard", "inventory"],
      active: true,
    });
    if (profile.error) throw profile.error;
  });

  test.afterAll(async () => {
    if (!service) return;
    for (const id of productIds) await service.from("inventory").delete().eq("id", id);
    if (userId) {
      await service.from("user_profiles").delete().eq("auth_user_id", userId);
      await service.auth.admin.deleteUser(userId);
    }
  });

  async function login(page) {
    await page.goto("/inventory", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel(/contrase/i).fill(password);
    await page.getByRole("button", { name: /entrar al sistema/i }).click();
    await expect(page).toHaveURL(/\/dashboard(?:$|\?)/, { timeout: 15_000 });
    await page.goto("/inventory", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Inventario de Productos" })).toBeVisible({
      timeout: 15_000,
    });
  }

  test("creates products at zero and with positive audited initial stock", async ({ page }) => {
    await login(page);
    for (const [name, quantity] of [
      ["Stock cero", "0"],
      ["Stock inicial", "7"],
    ]) {
      await page.getByRole("button", { name: "Nuevo producto" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Nombre del producto").fill(`CHG-27 ${name} ${suffix}`);
      await dialog.getByLabel("Categoría").fill("otro");
      await dialog.getByTestId("catalog-initial-quantity").fill(quantity);
      await dialog.getByRole("button", { name: "Agregar producto" }).click();
      await expect(dialog).toBeHidden();
      const row = page.locator("tr").filter({ hasText: `CHG-27 ${name} ${suffix}` });
      await expect(row).toBeVisible();
      const saved = await service
        .from("inventory")
        .select("id,quantity")
        .ilike("name", `CHG-27 ${name} ${suffix}`)
        .single();
      if (saved.error) throw saved.error;
      productIds.push(saved.data.id);
      expect(saved.data.quantity).toBe(Number(quantity));
    }
  });

  test("rejects non-integer initial stock without discarding the form", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await login(page);
    await page.getByRole("button", { name: "Nuevo producto" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Existencia inicial (opcional)" }).fill("1.5");
    await dialog.getByRole("button", { name: "Agregar producto" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#catalog-initial-quantity-error")).toContainText(
      "entero no negativo",
    );
    await expect(dialog.getByTestId("catalog-initial-quantity")).toHaveValue("1.5");
  });
});
