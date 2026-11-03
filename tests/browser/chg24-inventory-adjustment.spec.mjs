import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const username = `chg24-${suffix}`;
const email = `${username}@example.test`;
const password = `Inventory-${crypto.randomUUID()}-9a!`;
let service;
let userId;
let itemId;
let operationId;

test.describe.serial("CHG-24 inventory adjustment", () => {
  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey) throw new Error("Local Supabase is required");
    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    userId = created.data.user.id;
    const profile = await service.from("user_profiles").insert({
      auth_user_id: userId,
      username,
      name: "Synthetic CHG-24 operator",
      role: "admin",
      permissions: ["dashboard", "inventory"],
      active: true,
    });
    if (profile.error) throw profile.error;
    const item = await service
      .from("inventory")
      .insert({
        sku: `CHG24-${suffix}`,
        kind: "joya",
        name: `Ajuste CHG-24 ${suffix}`,
        category: "otro",
        cost_price: 1,
        price: 2,
        quantity: 0,
      })
      .select("id")
      .single();
    if (item.error) throw item.error;
    itemId = item.data.id;
    const seeded = await service.from("inventory").update({ quantity: 5 }).eq("id", itemId);
    if (seeded.error) throw seeded.error;
  });

  test.afterAll(async () => {
    if (!service) return;
    if (operationId) {
      await service.from("financial_audit_events").delete().eq("operation_id", operationId);
      await service.from("business_operations").delete().eq("id", operationId);
    }
    if (itemId) await service.from("inventory").delete().eq("id", itemId);
    if (userId) {
      await service.from("user_profiles").delete().eq("auth_user_id", userId);
      await service.auth.admin.deleteUser(userId);
    }
  });

  test("adjusts stock through the accessible dialog and persists audit reason", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.locator("#username").fill(username);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/inventory");
    const row = page.locator("tr").filter({ hasText: `CHG24-${suffix}` });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /Ajustar existencia/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Ajustar existencia" })).toBeVisible();
    await dialog.getByLabel("Existencia objetivo").fill("7");
    await dialog.getByLabel("Motivo obligatorio").fill("Conteo físico CHG-24");
    await dialog.getByRole("button", { name: "Confirmar ajuste" }).click();
    await expect(page.getByText("Existencia ajustada y auditada")).toBeVisible();
    const saved = await service.from("inventory").select("quantity").eq("id", itemId).single();
    expect(saved.data.quantity).toBe(7);
    const operation = await service
      .from("business_operations")
      .select("id,result")
      .eq("actor_id", userId)
      .eq("operation_type", "inventory_adjustment")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (operation.error) throw operation.error;
    operationId = operation.data.id;
    expect(operation.data.result.reason).toBe("Conteo físico CHG-24");
  });
});
