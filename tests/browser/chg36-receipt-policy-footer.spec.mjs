import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.CHG36_DISPOSABLE_TESTS === "1";
const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const container = process.env.LOCAL_SUPABASE_CONTAINER;
const effectiveAt = process.env.VITE_RECEIPT_POLICY_EFFECTIVE_AT;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const salesUser = {
  username: `chg36-admin-${suffix}`,
  email: `chg36-admin-${suffix}@example.test`,
  password: `Receipt-${crypto.randomUUID()}-9c!`,
};
const clientName = `CHG36 cliente sintético ${suffix}`;
const sku = `CHG36-${suffix}`;
const receiptNos = [
  `CHG36-PRE-${suffix}`,
  `CHG36-POST-${suffix}`,
  `CHG36-CREDIT-${suffix}`,
  `CHG36-VOID-${suffix}`,
];
let service;
let adminId;
let clientId;
let itemId;
let saleIds = [];

test.describe.serial("CHG-36 receipt policy footer", () => {
  test.skip(!enabled, "Receipt policy browser tests require a disposable local Supabase stack.");

  test.beforeAll(async () => {
    if (!url || !anonKey || !serviceKey || !container || !effectiveAt) {
      throw new Error("CHG-36 requires explicit local Supabase metadata and policy cutoff.");
    }
    const target = new URL(url);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) {
      throw new Error("CHG-36 refuses non-loopback Supabase URLs.");
    }
    if (!/^supabase_db_chg36[a-z0-9]+$/.test(container)) {
      throw new Error("CHG-36 refuses a database not dedicated to this disposable test.");
    }
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(effectiveAt) ||
      !Number.isFinite(Date.parse(effectiveAt))
    ) {
      throw new Error("CHG-36 requires a valid release cutoff timestamp.");
    }

    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const user = await service.auth.admin.createUser({
      email: salesUser.email,
      password: salesUser.password,
      email_confirm: true,
    });
    if (user.error) throw user.error;
    adminId = user.data.user.id;
    const profile = await service.from("user_profiles").insert({
      auth_user_id: adminId,
      username: salesUser.username,
      name: "Synthetic CHG-36 sales employee",
      role: "employee",
      permissions: ["dashboard", "sales", "clients", "settings"],
      active: true,
    });
    if (profile.error) throw profile.error;

    const client = await service
      .from("clients")
      .insert({ name: clientName, status: "activo" })
      .select("id")
      .single();
    if (client.error) throw client.error;
    clientId = client.data.id;

    const item = await service
      .from("inventory")
      .insert({
        kind: "product",
        sku,
        name: `CHG36 artículo ${suffix}`,
        category: "otro",
        cost_price: 10,
        price: 20,
        quantity: 0,
        is_active: true,
      })
      .select("id")
      .single();
    if (item.error) throw item.error;
    itemId = item.data.id;

    const cutoff = Date.parse(effectiveAt);
    const createdAt = [cutoff - 1, cutoff, cutoff + 1, cutoff + 2].map((instant) =>
      new Date(instant).toISOString(),
    );
    const sales = await service
      .from("sales")
      .insert([
        {
          receipt_no: receiptNos[0],
          client_id: clientId,
          subtotal: 20,
          tax_rate: 0,
          tax: 0,
          total: 20,
          payment_type: "contado",
          created_at: createdAt[0],
        },
        {
          receipt_no: receiptNos[1],
          client_id: clientId,
          subtotal: 20,
          tax_rate: 0,
          tax: 0,
          total: 20,
          payment_type: "contado",
          created_at: createdAt[1],
        },
        {
          receipt_no: receiptNos[2],
          client_id: clientId,
          subtotal: 20,
          tax_rate: 0,
          tax: 0,
          total: 20,
          payment_type: "credito",
          created_at: createdAt[2],
        },
        {
          receipt_no: receiptNos[3],
          client_id: clientId,
          subtotal: 20,
          tax_rate: 0,
          tax: 0,
          total: 20,
          payment_type: "contado",
          created_at: createdAt[3],
          voided_at: createdAt[3],
          voided_by: adminId,
          void_reason: "Prueba local CHG-36",
        },
      ])
      .select("id,receipt_no");
    if (sales.error) throw sales.error;
    saleIds = sales.data.map((sale) => sale.id);
    const lines = await service.from("sale_lines").insert(
      sales.data.map((sale) => ({
        sale_id: sale.id,
        item_id: itemId,
        sku,
        name: `CHG36 snapshot ${suffix}`,
        unit_price: 20,
        quantity: 1,
      })),
    );
    if (lines.error) throw lines.error;
  });

  test.afterAll(async () => {
    if (service && saleIds.length) {
      await service.from("sale_lines").delete().in("sale_id", saleIds);
      await service.from("sales").delete().in("id", saleIds);
    }
    if (service && itemId) await service.from("inventory").delete().eq("id", itemId);
    if (service && clientId) await service.from("clients").delete().eq("id", clientId);
    if (service && adminId) {
      await service.from("user_profiles").delete().eq("auth_user_id", adminId);
      await service.auth.admin.deleteUser(adminId);
    }
  });

  async function login(page) {
    await page.goto("/login");
    const submit = page.getByRole("button", { name: "Entrar al sistema" });
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    const usernameInput = page.getByLabel("Usuario");
    const passwordInput = page.getByLabel("Contraseña");
    await usernameInput.fill(salesUser.username);
    await passwordInput.fill(salesUser.password);
    await expect(usernameInput).toHaveValue(salesUser.username);
    await expect(passwordInput).toHaveValue(salesUser.password);
    const loginResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname.endsWith("/functions/v1/username-login"),
      { timeout: 15_000 },
    );
    await submit.click();
    const response = await loginResponse;
    if (!response.ok()) {
      throw new Error(`CHG-36 synthetic username-login returned HTTP ${response.status()}.`);
    }
    const logout = page.getByRole("button", { name: "Cerrar sesión" });
    await expect(logout).toBeVisible({ timeout: 15_000 });
  }

  async function openReceipt(page, receiptNo) {
    await page.getByLabel("Buscar").fill(receiptNo);
    await expect(page.getByRole("button", { name: `Ver recibo ${receiptNo}` })).toBeVisible();
    await page.getByRole("button", { name: `Ver recibo ${receiptNo}` }).click();
    return page.getByRole("dialog");
  }

  test("applies the policy cutoff to historic, current, voided, and printed receipts", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/sales");

    const currentReceipt = await openReceipt(page, receiptNos[1]);
    const printReceipt = currentReceipt.locator("#receipt-print");
    await expect(currentReceipt).toContainText("RECIBO INTERNO — NO ES COMPROBANTE FISCAL");
    await expect(printReceipt.getByTestId("receipt-policy")).toBeVisible();
    await expect(printReceipt.getByTestId("receipt-policy-thanks")).toHaveText(
      "¡GRACIAS POR SU COMPRA!",
    );
    await expect(printReceipt.getByTestId("receipt-policy-title")).toHaveText(
      "POLÍTICA DE CAMBIOS Y DEVOLUCIONES",
    );
    await expect(printReceipt.getByTestId("receipt-policy-paragraph")).toHaveText([
      "No realizamos devoluciones de dinero por cambios de opinión.",
      "Los cambios por otros productos pueden solicitarse dentro de los 15 días posteriores a la compra, presentando el recibo y el producto en buen estado.",
      "Verifique sus productos antes de retirarse del establecimiento.",
      "Esta política no limita las garantías ni los derechos del consumidor establecidos por la ley.",
    ]);
    await expect(printReceipt).toContainText("RD$20.00");
    await expect(printReceipt).toContainText(clientName);
    await expect(printReceipt).toContainText(`CHG36 snapshot ${suffix}`);
    const contentOrder = await printReceipt.evaluate((receipt) => {
      const totalRow = [...receipt.querySelectorAll("div")].find(
        (element) => element.firstElementChild?.textContent?.trim() === "Total",
      );
      const policy = receipt.querySelector("[data-testid='receipt-policy']");
      return Boolean(
        totalRow &&
        policy &&
        totalRow.compareDocumentPosition(policy) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
    expect(contentOrder).toBe(true);

    await page.emulateMedia({ media: "print" });
    for (const width of [794, 320]) {
      await page.setViewportSize({ width, height: 1123 });
      const dimensions = await printReceipt.evaluate((element) => ({
        client: element.clientWidth,
        scroll: element.scrollWidth,
        visibility: getComputedStyle(element).visibility,
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
        viewport: window.innerWidth,
        dialog: (() => {
          const parent = element.closest(".receipt-dialog");
          const style = getComputedStyle(parent);
          const rect = parent.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            width: rect.width,
            position: style.position,
            cssLeft: style.left,
            translate: style.translate,
            transform: style.transform,
          };
        })(),
      }));
      expect(dimensions.scroll, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.client);
      expect(dimensions.visibility).toBe("visible");
      expect(dimensions.dialog.translate, JSON.stringify(dimensions)).toBe("none");
      expect(dimensions.left, JSON.stringify(dimensions)).toBeGreaterThanOrEqual(0);
      expect(dimensions.right, JSON.stringify(dimensions)).toBeLessThanOrEqual(
        dimensions.viewport + 1,
      );
      const printState = await page.locator("body").evaluate((body) => {
        const receipt = body.querySelector(".receipt-dialog");
        const siblings = [...receipt.parentElement.children].filter(
          (element) => element !== receipt,
        );
        return {
          pageChromeVisible: [...body.children].some(
            (element) => !element.contains(receipt) && getComputedStyle(element).display !== "none",
          ),
          overlayVisible: siblings.some((element) => getComputedStyle(element).display !== "none"),
          policyBreakInside: getComputedStyle(receipt.querySelector(".receipt-policy")).breakInside,
        };
      });
      expect(printState.pageChromeVisible).toBe(false);
      expect(printState.overlayVisible).toBe(false);
      expect(printState.policyBreakInside).toBe("avoid");
      await expect(printReceipt.getByTestId("receipt-policy")).toBeVisible();
      const pdf =
        width === 794
          ? await page.pdf({ format: "A4", printBackground: true })
          : await page.pdf({ width: "80mm", height: "180mm", printBackground: true });
      expect(pdf.byteLength).toBeGreaterThan(0);
    }
    await page.emulateMedia({ media: "screen" });
    await currentReceipt.getByRole("button", { name: "Cerrar", exact: true }).click();

    const historicReceipt = await openReceipt(page, receiptNos[0]);
    await expect(historicReceipt.locator("#receipt-print")).not.toContainText(
      "POLÍTICA DE CAMBIOS Y DEVOLUCIONES",
    );
    await expect(historicReceipt.locator("#receipt-print")).toContainText("RD$20.00");
    await expect(historicReceipt.locator("#receipt-print")).toContainText(
      "Gracias por su compra en",
    );
    await historicReceipt.getByRole("button", { name: "Cerrar", exact: true }).click();

    const creditReceipt = await openReceipt(page, receiptNos[2]);
    await expect(creditReceipt.locator("#receipt-print")).toContainText("Cr\u00E9dito");
    await expect(
      creditReceipt.locator("#receipt-print").getByTestId("receipt-policy"),
    ).toBeVisible();
    await creditReceipt.getByRole("button", { name: "Cerrar", exact: true }).click();

    const voidedReceipt = await openReceipt(page, receiptNos[3]);
    await expect(voidedReceipt).toContainText("VENTA ANULADA");
    await expect(voidedReceipt).toContainText("Prueba local CHG-36");
    await expect(
      voidedReceipt.locator("#receipt-print").getByTestId("receipt-policy"),
    ).toBeVisible();
    await expect(voidedReceipt.locator("#receipt-print").getByTestId("receipt-policy")).toHaveCount(
      1,
    );
    await page.emulateMedia({ media: "print" });
    await expect(
      voidedReceipt.locator("#receipt-print").getByTestId("receipt-policy"),
    ).toBeVisible();
    await expect(voidedReceipt.locator("#receipt-print")).toContainText("RD$20.00");
    await page.emulateMedia({ media: "screen" });
    await voidedReceipt.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
