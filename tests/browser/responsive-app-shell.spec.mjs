import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const admin = {
  username: `shell-admin-${suffix}`,
  email: `shell-admin-${suffix}@example.test`,
  password: `Shell-Admin-${crypto.randomUUID()}-9c!`,
};
const employee = {
  username: `shell-employee-${suffix}`,
  email: `shell-employee-${suffix}@example.test`,
  password: `Shell-Employee-${crypto.randomUUID()}-9c!`,
};
let service;
let adminId;
let employeeId;

test.describe("responsive app shell", () => {
  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey) throw new Error("Local Supabase test environment is required");
    if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname)) {
      throw new Error("Refusing to run responsive shell tests against non-local Supabase");
    }

    service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const createdAdmin = await service.auth.admin.createUser({ email: admin.email, password: admin.password, email_confirm: true });
    if (createdAdmin.error) throw createdAdmin.error;
    adminId = createdAdmin.data.user.id;
    const adminProfile = await service.from("user_profiles").insert({
      auth_user_id: adminId,
      username: admin.username,
      name: "Responsive shell administrator",
      role: "admin",
      permissions: ["dashboard", "clients", "suppliers", "inventory", "sales", "purchases", "expenses", "settings"],
      active: true,
    });
    if (adminProfile.error) throw adminProfile.error;

    const createdEmployee = await service.auth.admin.createUser({ email: employee.email, password: employee.password, email_confirm: true });
    if (createdEmployee.error) throw createdEmployee.error;
    employeeId = createdEmployee.data.user.id;
    const employeeProfile = await service.from("user_profiles").insert({
      auth_user_id: employeeId,
      username: employee.username,
      name: "Responsive shell employee",
      role: "employee",
      permissions: ["dashboard", "inventory"],
      active: true,
    });
    if (employeeProfile.error) throw employeeProfile.error;
  });

  test.afterAll(async () => {
    if (!service) return;
    if (employeeId) await service.auth.admin.deleteUser(employeeId);
    if (adminId) await service.auth.admin.deleteUser(adminId);
  });

  async function login(page, user) {
    await page.goto("/login");
    const submit = page.getByRole("button", { name: "Entrar al sistema" });
    await expect(submit).toBeEnabled();
    await page.locator("#username").fill(user.username);
    await page.locator("#password").fill(user.password);
    await expect(page.locator("#username")).toHaveValue(user.username);
    await expect(page.locator("#password")).toHaveValue(user.password);
    await submit.click();
    await expect(page.getByRole("heading", { name: "Panel General" })).toBeVisible();
  }

  test("admin navigation, table, and dialog stay usable at the target widths", async ({ page }) => {
    await login(page, admin);

    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });

      if (width < 1024) {
        const menuButton = page.getByRole("button", { name: "Abrir menú" });
        await expect(menuButton).toBeVisible();
        await menuButton.focus();
        await page.keyboard.press("Enter");

        const mobileMenu = page.getByRole("dialog", { name: "Menú principal" });
        await expect(mobileMenu).toBeVisible();
        await expect(mobileMenu.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Inventario" })).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement))).toBe(true);
        await page.keyboard.press("Escape");
        await expect(mobileMenu).toBeHidden();
        await expect(menuButton).toBeFocused();

        await menuButton.click();
        await mobileMenu.getByRole("link", { name: "Inventario" }).click();
        await expect(mobileMenu).toBeHidden();
      } else {
        await expect(page.getByRole("button", { name: "Abrir menú" })).toBeHidden();
        await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
        await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Inventario" }).click();
      }

      await expect(page).toHaveURL(/\/inventory$/);
      if (width < 1024) {
        await page.getByRole("button", { name: "Abrir menú" }).click();
      }
      const inventoryLink = page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Inventario" });
      await expect(inventoryLink).toHaveAttribute("aria-current", "page");
      if (width < 1024) await page.keyboard.press("Escape");
      await expect(page.getByRole("table")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

      const dialogTrigger = page.getByRole("button", { name: "Nuevo producto" });
      await dialogTrigger.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect.poll(async () => {
        const box = await dialog.boundingBox();
        return Boolean(box && box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 900);
      }).toBe(true);
      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(dialogTrigger).toBeFocused();

      await page.screenshot({ path: test.info().outputPath(`app-shell-${width}.png`), fullPage: true });
    }

    await page.setViewportSize({ width: 640, height: 900 });
    await page.addStyleTag({ content: "html { zoom: 2; }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("app-shell-zoom-200.png"), fullPage: true });
  });

  test("employee menu stays permission-filtered and direct navigation is denied", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, employee);

    const menuButton = page.getByRole("button", { name: "Abrir menú" });
    await menuButton.click();
    const mobileMenu = page.getByRole("dialog", { name: "Menú principal" });
    const nav = mobileMenu.getByRole("navigation", { name: "Navegación principal" });
    await expect(nav.getByRole("link", { name: "Panel" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Inventario" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Ventas" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.goto("/sales");
    await expect(page.getByRole("heading", { name: "Acceso restringido" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Abrir menú" })).toBeVisible();
    await page.getByRole("button", { name: "Abrir menú" }).click();
    const restrictedNav = page.getByRole("dialog", { name: "Menú principal" }).getByRole("navigation", { name: "Navegación principal" });
    await expect(restrictedNav.getByRole("link", { name: "Ventas" })).toHaveCount(0);
  });

  test("inventory read errors remain visible and distinguishable from an empty catalog", async ({ page }) => {
    await login(page, admin);
    await page.route("**/rest/v1/inventory**", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "temporary local read failure" }) });
    });
    await page.goto("/inventory");
    await expect(page.getByRole("alert").filter({ hasText: "No se pudo cargar el catálogo" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("El catálogo no está disponible.")).toBeVisible();
  });
});
