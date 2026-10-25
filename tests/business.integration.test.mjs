import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";

const enabled = process.env.RUN_LOCAL_BUSINESS_INTEGRATION === "1";
const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const databaseContainer = process.env.LOCAL_SUPABASE_CONTAINER;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const password = `Local-${crypto.randomUUID()}-9a!`;
const service = enabled && url && serviceKey
  ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;
let admin;
let employee;
let clientId;
let supplierId;
let itemId;
let failItemId;
let failAdjustItemId;
let testSettings;

const integration = test.describe("local atomic financial operations", { skip: !enabled }, () => {
  before(async () => {
    assert.ok(url && anonKey && serviceKey, "local Supabase URL and keys are required");
    assert.match(databaseContainer ?? "", /^supabase_db_[a-z0-9-]+$/, "an explicit local PostgreSQL container is required");
    assert.ok(["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname), "business integration tests only run against local Supabase");

    for (const identity of [
      { key: "admin", role: "admin", permissions: ["dashboard", "clients", "suppliers", "inventory", "sales", "purchases", "expenses", "settings"] },
      { key: "sales", role: "employee", permissions: ["sales"] },
    ]) {
      const email = `chg07-${identity.key}-${suffix}@example.test`;
      const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
      assert.ifError(created.error);
      const profile = await service.from("user_profiles").insert({
        auth_user_id: created.data.user.id,
        username: `chg07-${identity.key}-${suffix}`,
        name: `Synthetic CHG-07 ${identity.key}`,
        role: identity.role,
        permissions: identity.permissions,
        active: true,
      });
      assert.ifError(profile.error);
      if (identity.key === "admin") admin = { id: created.data.user.id, email };
      else employee = { id: created.data.user.id, email };
    }

    const client = await service.from("clients").insert({ name: `CHG07 client ${suffix}` }).select("id").single();
    assert.ifError(client.error);
    clientId = client.data.id;
    const supplier = await service.from("suppliers").insert({ name: `CHG07 supplier ${suffix}` }).select("id").single();
    assert.ifError(supplier.error);
    supplierId = supplier.data.id;
    const item = await service.from("inventory").insert({
      sku: `CHG07-${suffix}`,
      kind: "joya",
      name: `CHG07 item ${suffix}`,
      category: "otro",
      cost_price: 12.25,
      price: 100,
      quantity: 0,
    }).select("id").single();
    assert.ifError(item.error);
    itemId = item.data.id;
    const failItem = await service.from("inventory").insert({
      sku: `CHG07-FAILSALE-${suffix}`,
      kind: "joya",
      name: `CHG07 rollback fixture ${suffix}`,
      category: "otro",
      cost_price: 1,
      price: 10,
      quantity: 0,
    }).select("id").single();
    assert.ifError(failItem.error);
    failItemId = failItem.data.id;
    const failAdjustItem = await service.from("inventory").insert({
      sku: `CHG07-FAILADJUST-${suffix}`,
      kind: "joya",
      name: `CHG07 adjustment rollback fixture ${suffix}`,
      category: "otro",
      cost_price: 1,
      price: 10,
      quantity: 0,
    }).select("id").single();
    assert.ifError(failAdjustItem.error);
    failAdjustItemId = failAdjustItem.data.id;

    const settings = await service.from("settings").select("*").single();
    assert.ifError(settings.error);
    testSettings = settings.data;
    // Synthetic local-only zero-tax fixture. This is not a business or tax policy approval.
    const policy = await service.from("settings").update({
      tax_rate: 0,
      tax_policy_approved: true,
      tax_prices_include: false,
      tax_rounding_policy: "synthetic-zero-tax-test-only",
    }).eq("id", settings.data.id);
    assert.ifError(policy.error);
  });

  after(async () => {
    if (!service) return;
    if (admin?.id || employee?.id) {
      const actorIds = [admin?.id, employee?.id].filter(Boolean);
      const operations = await service.from("business_operations").select("id").in("actor_id", actorIds);
      for (const operation of operations.data ?? []) {
        await service.from("payment_reversals").delete().eq("operation_id", operation.id);
        await service.from("financial_compensations").delete().eq("operation_id", operation.id);
        await service.from("financial_audit_events").delete().eq("operation_id", operation.id);
      }
      await service.from("business_operations").delete().in("actor_id", actorIds);
    }
    if (supplierId) {
      const purchases = await service.from("purchases").select("id").eq("supplier_id", supplierId);
      for (const purchase of purchases.data ?? []) {
        const credits = await service.from("supplier_credits").select("id").eq("purchase_id", purchase.id);
        for (const credit of credits.data ?? []) {
          await service.from("credit_payments").delete().eq("supplier_credit_id", credit.id);
          await service.from("supplier_credits").delete().eq("id", credit.id);
        }
        await service.from("purchases").delete().eq("id", purchase.id);
      }
    }
    for (const id of [itemId, failItemId, failAdjustItemId]) {
      if (id) {
        const sales = await service.from("sale_lines").select("sale_id").eq("item_id", id);
        const saleIds = [...new Set((sales.data ?? []).map((row) => row.sale_id))];
        for (const saleId of saleIds) {
          const credits = await service.from("client_credits").select("id").eq("sale_id", saleId);
          for (const credit of credits.data ?? []) {
            await service.from("credit_payments").delete().eq("client_credit_id", credit.id);
            await service.from("client_credits").delete().eq("id", credit.id);
          }
          await service.from("sale_lines").delete().eq("sale_id", saleId);
          await service.from("sales").delete().eq("id", saleId);
        }
        await service.from("inventory").delete().eq("id", id);
      }
    }
    if (clientId) await service.from("clients").delete().eq("id", clientId);
    if (supplierId) await service.from("suppliers").delete().eq("id", supplierId);
    if (testSettings) {
      await service.from("settings").update({
        tax_rate: testSettings.tax_rate,
        tax_policy_approved: testSettings.tax_policy_approved,
        tax_prices_include: testSettings.tax_prices_include,
        tax_rounding_policy: testSettings.tax_rounding_policy,
      }).eq("id", testSettings.id);
    }
    for (const identity of [employee, admin]) {
      if (!identity) continue;
      await service.from("user_profiles").delete().eq("auth_user_id", identity.id);
      await service.auth.admin.deleteUser(identity.id);
    }
  });

  async function signedIn(identity) {
    const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const result = await client.auth.signInWithPassword({ email: identity.email, password });
    assert.ifError(result.error);
    return client;
  }

  function directPostgresJson(sql) {
    const output = execFileSync("docker", ["exec", "-i", databaseContainer, "psql", "-X", "-A", "-t",
      "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
      input: `${sql}\n`, encoding: "utf8", windowsHide: true,
    });
    return JSON.parse(output.trim());
  }

  function directPostgres(sql) {
    execFileSync("docker", ["exec", "-i", databaseContainer, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
      input: `${sql}\n`, encoding: "utf8", windowsHide: true,
    });
  }

  const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;

  test("authorized purchase, restock and supplier credit are one durable idempotent operation", async () => {
    const actor = await signedIn(admin);
    const request = {
      idempotency_key: crypto.randomUUID(),
      supplier_id: supplierId,
      item_id: itemId,
      description: `Synthetic bulk purchase ${suffix}`,
      quantity: 3,
      unit_cost: "12.25",
      restock: true,
      payment_type: "credito",
      invoice_no: `CHG07-${suffix}`,
      due_date: "2026-12-31",
    };

    const first = await actor.rpc("post_purchase", { p_request: request });
    assert.ifError(first.error);
    assert.ok(first.data.purchase_id);
    assert.ok(first.data.supplier_credit_id);
    assert.equal(first.data.total, "36.75");

    const replay = await actor.rpc("post_purchase", { p_request: request });
    assert.ifError(replay.error);
    assert.deepEqual(replay.data, first.data, "a lost response retry returns the original result");

    const purchaseRows = await service.from("purchases").select("id,total").eq("invoice_no", request.invoice_no);
    assert.ifError(purchaseRows.error);
    assert.equal(purchaseRows.data.length, 1);
    const stock = await service.from("inventory").select("quantity").eq("id", itemId).single();
    assert.ifError(stock.error);
    assert.equal(stock.data.quantity, 3);
    const credit = await service.from("supplier_credits").select("total,paid,balance").eq("id", first.data.supplier_credit_id).single();
    assert.ifError(credit.error);
    assert.deepEqual(credit.data, { total: 36.75, paid: 0, balance: 36.75 });

    const supplierPaymentRequest = { idempotency_key: crypto.randomUUID(), credit_type: "supplier",
      credit_id: first.data.supplier_credit_id, amount: "10.00", method: "transferencia" };
    const supplierPayment = await actor.rpc("post_credit_payment", { p_request: supplierPaymentRequest });
    assert.ifError(supplierPayment.error);
    const supplierPaymentReplay = await actor.rpc("post_credit_payment", { p_request: supplierPaymentRequest });
    assert.ifError(supplierPaymentReplay.error);
    assert.deepEqual(supplierPaymentReplay.data, supplierPayment.data);
    const updatedSupplierCredit = await service.from("supplier_credits").select("paid,balance").eq("id", first.data.supplier_credit_id).single();
    assert.deepEqual(updatedSupplierCredit.data, { paid: 10, balance: 26.75 });

    const changedPayload = await actor.rpc("post_purchase", {
      p_request: { ...request, quantity: 4 },
    });
    assert.ok(changedPayload.error, "reusing an idempotency key with changed content is a conflict");
    const afterConflict = await service.from("purchases").select("id").eq("invoice_no", request.invoice_no);
    assert.equal(afterConflict.data.length, 1);
  });

  test("purchase is denied without its current permission", async () => {
    const actor = await signedIn(employee);
    const denied = await actor.rpc("post_purchase", { p_request: {
      idempotency_key: crypto.randomUUID(), quantity: 1, unit_cost: "1.00",
      payment_type: "contado", description: `Denied ${suffix}`,
    } });
    assert.equal(denied.error?.code, "42501");
    const rows = await service.from("purchases").select("id").ilike("description", `Denied ${suffix}`);
    assert.ifError(rows.error);
    assert.equal(rows.data.length, 0);
  });

  test("a forced supplier-credit write failure rolls back the purchase and stock increment", async () => {
    const actor = await signedIn(admin);
    const before = await service.from("inventory").select("quantity").eq("id", itemId).single();
    assert.ifError(before.error);
    const invoice = `CHG07-FAIL-${suffix}`;
    const failed = await actor.rpc("post_purchase", { p_request: {
      idempotency_key: crypto.randomUUID(), supplier_id: supplierId, item_id: itemId,
      description: `Injected rollback ${suffix}`, quantity: 2, unit_cost: "3.25", restock: true,
      payment_type: "credito", invoice_no: invoice,
    } });
    assert.equal(failed.error?.code, "23514");
    const purchases = await service.from("purchases").select("id").eq("invoice_no", invoice);
    assert.ifError(purchases.error);
    assert.equal(purchases.data.length, 0);
    const after = await service.from("inventory").select("quantity").eq("id", itemId).single();
    assert.equal(after.data.quantity, before.data.quantity);
    const credits = await service.from("supplier_credits").select("id").eq("invoice_no", invoice);
    assert.equal(credits.data.length, 0);
  });

  test("a forced sale-line failure rolls back the sale header", async () => {
    const actor = await signedIn(admin);
    const seeded = await service.from("inventory").update({ quantity: 1 }).eq("id", failItemId);
    assert.ifError(seeded.error);
    const before = await service.from("sales").select("id").eq("client_id", clientId);
    assert.ifError(before.error);
    const failed = await actor.rpc("post_sale", { p_request: {
      idempotency_key: crypto.randomUUID(), client_id: clientId, payment_type: "contado",
      lines: [{ item_id: failItemId, quantity: 1, expected_unit_price: "10.00" }],
    } });
    assert.equal(failed.error?.code, "23514");
    const after = await service.from("sales").select("id").eq("client_id", clientId);
    assert.equal(after.data.length, before.data.length);
    const stock = await service.from("inventory").select("quantity").eq("id", failItemId).single();
    assert.equal(stock.data.quantity, 1);
  });

  test("a forced credit-balance failure rolls back the preceding payment insert", async () => {
    const actor = await signedIn(admin);
    const seeded = await service.from("inventory").update({ quantity: 1 }).eq("id", itemId);
    assert.ifError(seeded.error);
    const sale = await actor.rpc("post_sale", { p_request: {
      idempotency_key: crypto.randomUUID(), client_id: clientId, payment_type: "credito",
      due_date: "1999-01-01", lines: [{ item_id: itemId, quantity: 1, expected_unit_price: "100.00" }],
    } });
    assert.ifError(sale.error);
    const before = await service.from("credit_payments").select("id").eq("client_credit_id", sale.data.client_credit_id);
    assert.equal(before.data.length, 0);
    const paymentKey = crypto.randomUUID();
    const failed = await actor.rpc("post_credit_payment", { p_request: {
      idempotency_key: paymentKey, credit_type: "client", credit_id: sale.data.client_credit_id,
      amount: "25.00", method: "efectivo",
    } });
    assert.equal(failed.error?.code, "23514");
    const after = await service.from("credit_payments").select("id").eq("client_credit_id", sale.data.client_credit_id);
    assert.equal(after.data.length, 0);
    const credit = await service.from("client_credits").select("paid,balance").eq("id", sale.data.client_credit_id).single();
    assert.deepEqual(credit.data, { paid: 0, balance: 100 });
    const operation = await service.from("business_operations").select("id").eq("actor_id", admin.id).eq("idempotency_key", paymentKey);
    assert.equal(operation.data.length, 0);
  });

  test("sale posts current catalog price, stock, and customer credit atomically; payment replays safely", async () => {
    const actor = await signedIn(employee);
    const seeded = await service.from("inventory").update({ quantity: 3 }).eq("id", itemId);
    assert.ifError(seeded.error);
    const saleRequest = {
      idempotency_key: crypto.randomUUID(),
      client_id: clientId,
      actor_id: crypto.randomUUID(),
      payment_type: "credito",
      due_date: "2026-12-31",
      total: "0.01",
      lines: [{ item_id: itemId, quantity: 1, expected_unit_price: "100.00" }],
    };
    const missingQuote = await actor.rpc("post_sale", { p_request: {
      idempotency_key: crypto.randomUUID(), client_id: clientId, payment_type: "contado",
      lines: [{ item_id: itemId, quantity: 1 }],
    } });
    assert.equal(missingQuote.error?.code, "22023");
    const sale = await actor.rpc("post_sale", { p_request: saleRequest });
    assert.ifError(sale.error);
    assert.equal(sale.data.total, "100.00");
    assert.ok(sale.data.client_credit_id);
    const saleReplay = await actor.rpc("post_sale", { p_request: saleRequest });
    assert.ifError(saleReplay.error);
    assert.deepEqual(saleReplay.data, sale.data);
    const revoke = await service.from("user_profiles").update({ active: false }).eq("auth_user_id", employee.id);
    assert.ifError(revoke.error);
    const revokedReplay = await actor.rpc("post_sale", { p_request: saleRequest });
    assert.equal(revokedReplay.error?.code, "42501", "revocation is checked before returning an old result");
    const restore = await service.from("user_profiles").update({ active: true }).eq("auth_user_id", employee.id);
    assert.ifError(restore.error);
    const changedPrice = await actor.rpc("post_sale", { p_request: {
      idempotency_key: crypto.randomUUID(), client_id: clientId, payment_type: "contado",
      lines: [{ item_id: itemId, quantity: 1, expected_unit_price: "99.00" }],
    } });
    assert.equal(changedPrice.error?.code, "40001");
    const stockAfterSale = await service.from("inventory").select("quantity").eq("id", itemId).single();
    assert.equal(stockAfterSale.data.quantity, 2);

    const paymentRequest = {
      idempotency_key: crypto.randomUUID(), credit_type: "client",
      credit_id: sale.data.client_credit_id, amount: "40.00", method: "efectivo",
    };
    const forbiddenPayment = await actor.rpc("post_credit_payment", { p_request: paymentRequest });
    assert.equal(forbiddenPayment.error?.code, "42501", "sales permission does not grant client-payment permission");
    const clientActor = await signedIn(admin);
    const payment = await clientActor.rpc("post_credit_payment", { p_request: paymentRequest });
    assert.ifError(payment.error);
    const replay = await clientActor.rpc("post_credit_payment", { p_request: paymentRequest });
    assert.ifError(replay.error);
    assert.deepEqual(replay.data, payment.data);
    const credit = await service.from("client_credits").select("total,paid,balance,status").eq("id", sale.data.client_credit_id).single();
    assert.deepEqual(credit.data, { total: 100, paid: 40, balance: 60, status: "parcial" });
    const paymentRows = await service.from("credit_payments").select("id").eq("client_credit_id", sale.data.client_credit_id);
    assert.equal(paymentRows.data.length, 1);
    const overpay = await clientActor.rpc("post_credit_payment", { p_request: {
      idempotency_key: crypto.randomUUID(), credit_type: "client",
      credit_id: sale.data.client_credit_id, amount: "60.01", method: "efectivo",
    } });
    assert.equal(overpay.error?.code, "23514");
    const unchanged = await service.from("client_credits").select("paid,balance").eq("id", sale.data.client_credit_id).single();
    assert.deepEqual(unchanged.data, { paid: 40, balance: 60 });
  });

  test("concurrent sales cannot consume more than the last available unit", async () => {
    const actor = await signedIn(admin);
    const seeded = await service.from("inventory").update({ quantity: 1 }).eq("id", itemId);
    assert.ifError(seeded.error);
    const attempts = await Promise.all([1, 2].map(() => actor.rpc("post_sale", { p_request: {
      idempotency_key: crypto.randomUUID(), client_id: clientId, payment_type: "contado",
      lines: [{ item_id: itemId, quantity: 1, expected_unit_price: "100.00" }],
    } })));
    assert.equal(attempts.filter((result) => !result.error).length, 1);
    assert.equal(attempts.filter((result) => result.error).length, 1);
    const stock = await service.from("inventory").select("quantity").eq("id", itemId).single();
    assert.equal(stock.data.quantity, 0);
  });

  test("concurrent independent sessions cannot overpay one customer debt", async () => {
    const seller = await signedIn(employee);
    const payerA = await signedIn(admin);
    const payerB = await signedIn(admin);
    const seeded = await service.from("inventory").update({ quantity: 1 }).eq("id", itemId);
    assert.ifError(seeded.error);
    const sale = await seller.rpc("post_sale", { p_request: {
      idempotency_key: crypto.randomUUID(), client_id: clientId, payment_type: "credito",
      lines: [{ item_id: itemId, quantity: 1, expected_unit_price: "100.00" }],
    } });
    assert.ifError(sale.error);
    const requests = [70, 40].map((amount) => ({ idempotency_key: crypto.randomUUID(),
      credit_type: "client", credit_id: sale.data.client_credit_id, amount: amount.toFixed(2), method: "efectivo" }));
    const attempts = await Promise.all([
      payerA.rpc("post_credit_payment", { p_request: requests[0] }),
      payerB.rpc("post_credit_payment", { p_request: requests[1] }),
    ]);
    assert.equal(attempts.filter((result) => !result.error).length, 1);
    assert.equal(attempts.filter((result) => result.error).length, 1);
    const credit = await service.from("client_credits").select("total,paid,balance,status").eq("id", sale.data.client_credit_id).single();
    assert.ifError(credit.error);
    assert.equal(credit.data.total, 100);
    assert.ok([40, 70].includes(credit.data.paid));
    assert.equal(credit.data.balance, 100 - credit.data.paid);
    assert.equal(credit.data.status, "parcial");
    const payments = await service.from("credit_payments").select("id,amount").eq("client_credit_id", sale.data.client_credit_id);
    assert.ifError(payments.error);
    assert.equal(payments.data.length, 1);
    assert.equal(Number(payments.data[0].amount), credit.data.paid);
    const persisted = directPostgresJson(`SELECT jsonb_build_object('total',total,'paid',paid,'balance',balance,
      'payments',(SELECT count(*) FROM public.credit_payments WHERE client_credit_id=${sqlString(sale.data.client_credit_id)}::uuid))
      FROM public.client_credits WHERE id=${sqlString(sale.data.client_credit_id)}::uuid;`);
    assert.deepEqual(persisted, { total: 100, paid: credit.data.paid, balance: credit.data.balance, payments: 1 });
  });

  test("concurrent purchase and sale on one item preserve stock and both documents", async () => {
    const buyer = await signedIn(admin);
    const seller = await signedIn(employee);
    const seeded = await service.from("inventory").update({ quantity: 2 }).eq("id", itemId);
    assert.ifError(seeded.error);
    const invoice = `CHG07-MIX-${suffix}`;
    const purchaseRequest = { idempotency_key: crypto.randomUUID(), supplier_id: supplierId, item_id: itemId,
      description: `Concurrent synthetic restock ${suffix}`, quantity: 2, unit_cost: "12.25", restock: true,
      payment_type: "contado", invoice_no: invoice };
    const saleRequest = { idempotency_key: crypto.randomUUID(), client_id: clientId, payment_type: "contado",
      lines: [{ item_id: itemId, quantity: 2, expected_unit_price: "100.00" }] };
    const [purchase, sale] = await Promise.all([
      buyer.rpc("post_purchase", { p_request: purchaseRequest }),
      seller.rpc("post_sale", { p_request: saleRequest }),
    ]);
    assert.ifError(purchase.error);
    assert.ifError(sale.error);
    const stock = await service.from("inventory").select("quantity").eq("id", itemId).single();
    assert.ifError(stock.error);
    assert.equal(stock.data.quantity, 2);
    const purchaseDoc = await service.from("purchases").select("id,quantity").eq("invoice_no", invoice).single();
    assert.ifError(purchaseDoc.error);
    assert.equal(purchaseDoc.data.quantity, 2);
    const purchaseOperation = await service.from("business_operations").select("request,result").eq("id", purchase.data.operation_id).single();
    assert.ifError(purchaseOperation.error);
    assert.equal(purchaseOperation.data.request.restock, true);
    assert.equal(purchaseOperation.data.request.quantity, 2);
    assert.ok([2, 4].includes(Number(purchaseOperation.data.result.stock_quantity)));
    const saleLine = await service.from("sale_lines").select("sale_id,quantity").eq("sale_id", sale.data.sale_id).single();
    assert.ifError(saleLine.error);
    assert.equal(saleLine.data.quantity, 2);
    const saleOperation = await service.from("business_operations").select("request,result").eq("id", sale.data.operation_id).single();
    assert.ifError(saleOperation.error);
    assert.equal(saleOperation.data.request.lines[0].quantity, 2);
    assert.equal(saleOperation.data.result.sale_id, sale.data.sale_id);
    assert.ok([0, 2].includes(Number(saleOperation.data.result.stock[itemId])));
    const persisted = directPostgresJson(`SELECT jsonb_build_object(
      'quantity',(SELECT quantity FROM public.inventory WHERE id=${sqlString(itemId)}::uuid),
      'purchases',(SELECT count(*) FROM public.purchases WHERE invoice_no=${sqlString(invoice)}),
      'sale_lines',(SELECT count(*) FROM public.sale_lines WHERE sale_id=${sqlString(sale.data.sale_id)}::uuid),
      'purchase_restock',(SELECT request->>'restock' FROM public.business_operations WHERE id=${sqlString(purchase.data.operation_id)}::uuid))`);
    assert.deepEqual(persisted, { quantity: 2, purchases: 1, sale_lines: 1, purchase_restock: "true" });
  });

  test("simultaneous same-key requests across sessions return one durable result and reject changed content", async () => {
    const sessionA = await signedIn(admin);
    const sessionB = await signedIn(admin);
    const key = crypto.randomUUID();
    const invoice = `CHG07-IDEM-${suffix}`;
    const beforeStock = await service.from("inventory").select("quantity").eq("id", itemId).single();
    assert.ifError(beforeStock.error);
    const request = { idempotency_key: key, supplier_id: supplierId, item_id: itemId,
      description: `Concurrent idempotent purchase ${suffix}`, quantity: 1, unit_cost: "12.25", restock: true,
      payment_type: "contado", invoice_no: invoice };
    const [first, second] = await Promise.all([
      sessionA.rpc("post_purchase", { p_request: request }),
      sessionB.rpc("post_purchase", { p_request: request }),
    ]);
    assert.ifError(first.error);
    assert.ifError(second.error);
    assert.deepEqual(first.data, second.data);
    const docs = await service.from("purchases").select("id").eq("invoice_no", invoice);
    assert.ifError(docs.error);
    assert.equal(docs.data.length, 1);
    const operations = await service.from("business_operations").select("id,result").eq("actor_id", admin.id)
      .eq("operation_type", "purchase").eq("idempotency_key", key);
    assert.ifError(operations.error);
    assert.equal(operations.data.length, 1);
    assert.deepEqual(operations.data[0].result, first.data);
    const changed = await sessionB.rpc("post_purchase", { p_request: { ...request, quantity: 3 } });
    assert.ok(changed.error);
    const stock = await service.from("inventory").select("quantity").eq("id", itemId).single();
    assert.equal(stock.data.quantity, beforeStock.data.quantity + 1);
    const persisted = directPostgresJson(`SELECT jsonb_build_object(
      'quantity',(SELECT quantity FROM public.inventory WHERE id=${sqlString(itemId)}::uuid),
      'purchases',(SELECT count(*) FROM public.purchases WHERE invoice_no=${sqlString(invoice)}),
      'operations',(SELECT count(*) FROM public.business_operations WHERE actor_id=${sqlString(admin.id)}::uuid
        AND operation_type='purchase' AND idempotency_key=${sqlString(key)}::uuid))`);
    assert.deepEqual(persisted, { quantity: beforeStock.data.quantity + 1, purchases: 1, operations: 1 });
  });

  test("transport loss before and after commit is reconciled by UUID without partial writes", async () => {
    const actor = await signedIn(admin);
    const session = await actor.auth.getSession();
    assert.ifError(session.error);
    const beforeKey = crypto.randomUUID();
    const beforeInvoice = `CHG07-BEFORE-${suffix}`;
    const stockBeforeInterruption = await service.from("inventory").select("quantity").eq("id", itemId).single();
    assert.ifError(stockBeforeInterruption.error);
    const beforeRequest = { idempotency_key: beforeKey, supplier_id: supplierId, item_id: itemId,
      description: `Pre-commit disconnect ${suffix}`, quantity: 3, unit_cost: "2.00", restock: true,
      payment_type: "contado", invoice_no: beforeInvoice };
    const abort = new AbortController();
    const interrupted = fetch(`${url}/rest/v1/rpc/post_purchase`, {
      method: "POST", signal: abort.signal,
      headers: { apikey: anonKey, authorization: `Bearer ${session.data.session.access_token}`,
        "content-type": "application/json", "content-profile": "public", "accept-profile": "public" },
      body: JSON.stringify({ p_request: beforeRequest }),
    });
    setTimeout(() => abort.abort(), 150);
    await assert.rejects(interrupted, (error) => error.name === "AbortError");
    await new Promise((resolve) => setTimeout(resolve, 4500));
    const beforeDoc = await service.from("purchases").select("id").eq("invoice_no", beforeInvoice);
    assert.ifError(beforeDoc.error);
    const beforeOperation = await service.from("business_operations").select("id,result").eq("actor_id", admin.id)
      .eq("operation_type", "purchase").eq("idempotency_key", beforeKey);
    assert.ifError(beforeOperation.error);
    assert.ok(beforeDoc.data.length === 0 || beforeDoc.data.length === 1);
    if (beforeDoc.data.length === 0) assert.equal(beforeOperation.data.length, 0, "pre-commit cancellation rolls back the reservation too");
    else {
      assert.equal(beforeOperation.data.length, 1);
      const reconciliation = await actor.rpc("get_business_operation", { p_operation_type: "purchase", p_idempotency_key: beforeKey });
      assert.ifError(reconciliation.error);
      assert.deepEqual(reconciliation.data, beforeOperation.data[0].result);
    }
    const retry = await actor.rpc("post_purchase", { p_request: beforeRequest });
    assert.ifError(retry.error);
    const afterBeforeRetry = await service.from("purchases").select("id").eq("invoice_no", beforeInvoice);
    assert.equal(afterBeforeRetry.data.length, 1);
    const stockAfterBeforeRetry = await service.from("inventory").select("quantity").eq("id", itemId).single();
    assert.equal(stockAfterBeforeRetry.data.quantity, stockBeforeInterruption.data.quantity + 3);
    const beforePostgres = directPostgresJson(`SELECT jsonb_build_object(
      'quantity',(SELECT quantity FROM public.inventory WHERE id=${sqlString(itemId)}::uuid),
      'purchases',(SELECT count(*) FROM public.purchases WHERE invoice_no=${sqlString(beforeInvoice)}),
      'operations',(SELECT count(*) FROM public.business_operations WHERE actor_id=${sqlString(admin.id)}::uuid
        AND operation_type='purchase' AND idempotency_key=${sqlString(beforeKey)}::uuid))`);
    assert.deepEqual(beforePostgres, { quantity: stockBeforeInterruption.data.quantity + 3, purchases: 1, operations: 1 });

    const afterKey = crypto.randomUUID();
    const afterInvoice = `CHG07-AFTER-${suffix}`;
    const stockBeforeLostResponse = await service.from("inventory").select("quantity").eq("id", itemId).single();
    assert.ifError(stockBeforeLostResponse.error);
    const afterRequest = { idempotency_key: afterKey, supplier_id: supplierId, item_id: itemId,
      description: `Post-commit lost response ${suffix}`, quantity: 2, unit_cost: "3.00", restock: true,
      payment_type: "contado", invoice_no: afterInvoice };
    const proxy = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const upstream = await fetch(`${url}${req.url}`, { method: req.method, headers: {
        apikey: anonKey, authorization: `Bearer ${session.data.session.access_token}`,
        "content-type": "application/json", "content-profile": "public", "accept-profile": "public",
      }, body: Buffer.concat(chunks) });
      await upstream.arrayBuffer();
      res.destroy(); // Lose the response after PostgREST has received PostgreSQL's committed RPC result.
    });
    await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const address = proxy.address();
    try {
      await assert.rejects(fetch(`http://127.0.0.1:${address.port}/rest/v1/rpc/post_purchase`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ p_request: afterRequest }),
      }));
    } finally { await new Promise((resolve) => proxy.close(resolve)); }
    const committed = await service.from("purchases").select("id").eq("invoice_no", afterInvoice);
    assert.ifError(committed.error);
    assert.equal(committed.data.length, 1);
    const durable = await service.from("business_operations").select("id,result").eq("actor_id", admin.id)
      .eq("operation_type", "purchase").eq("idempotency_key", afterKey);
    assert.ifError(durable.error);
    assert.equal(durable.data.length, 1);
    const reconciliation = await actor.rpc("get_business_operation", { p_operation_type: "purchase", p_idempotency_key: afterKey });
    assert.ifError(reconciliation.error);
    assert.deepEqual(reconciliation.data, durable.data[0].result);
    const replay = await actor.rpc("post_purchase", { p_request: afterRequest });
    assert.ifError(replay.error);
    assert.deepEqual(replay.data, durable.data[0].result);
    const noDuplicate = await service.from("purchases").select("id").eq("invoice_no", afterInvoice);
    assert.equal(noDuplicate.data.length, 1);
    const stockAfterLostResponse = await service.from("inventory").select("quantity").eq("id", itemId).single();
    assert.equal(stockAfterLostResponse.data.quantity, stockBeforeLostResponse.data.quantity + 2);
    const afterPostgres = directPostgresJson(`SELECT jsonb_build_object(
      'quantity',(SELECT quantity FROM public.inventory WHERE id=${sqlString(itemId)}::uuid),
      'purchases',(SELECT count(*) FROM public.purchases WHERE invoice_no=${sqlString(afterInvoice)}),
      'operations',(SELECT count(*) FROM public.business_operations WHERE actor_id=${sqlString(admin.id)}::uuid
        AND operation_type='purchase' AND idempotency_key=${sqlString(afterKey)}::uuid))`);
    assert.deepEqual(afterPostgres, { quantity: stockBeforeLostResponse.data.quantity + 2, purchases: 1, operations: 1 });
  });

  test("unapproved tax configuration blocks sale without a false financial result", async () => {
    const actor = await signedIn(admin);
    const before = await service.from("sales").select("id").eq("client_id", clientId);
    assert.ifError(before.error);
    const configured = await service.from("settings").update({ tax_policy_approved: false }).eq("id", testSettings.id);
    assert.ifError(configured.error);
    const result = await actor.rpc("post_sale", { p_request: {
      idempotency_key: crypto.randomUUID(), client_id: clientId, payment_type: "contado",
      lines: [{ item_id: itemId, quantity: 1, expected_unit_price: "100.00" }],
    } });
    assert.equal(result.error?.code, "55000");
    const after = await service.from("sales").select("id").eq("client_id", clientId);
    assert.equal(after.data.length, before.data.length);
    const restore = await service.from("settings").update({ tax_policy_approved: true }).eq("id", testSettings.id);
    assert.ifError(restore.error);
  });

  test("inventory adjustment checks permission, expected stock, and nonnegative quantity", async () => {
    const actor = await signedIn(admin);
    const before = await service.from("inventory").select("quantity").eq("id", itemId).single();
    assert.ifError(before.error);
    const request = { idempotency_key: crypto.randomUUID(), item_id: itemId, delta: 2,
      expected_quantity: before.data.quantity, reason: "Synthetic CHG-07 local count" };
    const posted = await actor.rpc("adjust_inventory", { p_request: request });
    assert.ifError(posted.error);
    assert.equal(posted.data.quantity, before.data.quantity + 2);
    const replay = await actor.rpc("adjust_inventory", { p_request: request });
    assert.ifError(replay.error);
    assert.deepEqual(replay.data, posted.data);
    const stale = await actor.rpc("adjust_inventory", { p_request: {
      idempotency_key: crypto.randomUUID(), item_id: itemId, delta: 1,
      expected_quantity: before.data.quantity, reason: "Stale synthetic count",
    } });
    assert.equal(stale.error?.code, "40001");
    const employeeActor = await signedIn(employee);
    const denied = await employeeActor.rpc("adjust_inventory", { p_request: {
      idempotency_key: crypto.randomUUID(), item_id: itemId, delta: 1, reason: "Denied count",
    } });
    assert.equal(denied.error?.code, "42501");
  });

  test("a forced inventory write failure leaves neither stock nor an idempotency result", async () => {
    const actor = await signedIn(admin);
    const seeded = await service.from("inventory").update({ quantity: 1 }).eq("id", failAdjustItemId);
    assert.ifError(seeded.error);
    const key = crypto.randomUUID();
    const failed = await actor.rpc("adjust_inventory", { p_request: {
      idempotency_key: key, item_id: failAdjustItemId, delta: 1, expected_quantity: 1, reason: "Injected local failure",
    } });
    assert.equal(failed.error?.code, "23514");
    const stock = await service.from("inventory").select("quantity").eq("id", failAdjustItemId).single();
    assert.equal(stock.data.quantity, 1);
    const operation = await service.from("business_operations").select("id").eq("actor_id", admin.id).eq("idempotency_key", key);
    assert.equal(operation.data.length, 0);
  });

  test("posted operations create an immutable audit event attributed to the Auth actor", async () => {
    const actor = await signedIn(admin);
    const result = await actor.rpc("adjust_inventory", { p_request: {
      idempotency_key: crypto.randomUUID(), item_id: itemId, delta: 1, reason: "Synthetic CHG-08 audit fixture",
      actor_id: employee.id, occurred_at: "2000-01-01T00:00:00Z",
    } });
    assert.ifError(result.error);
    const event = await service.from("financial_audit_events").select("id,operation_id,actor_id,event_type,entity_type,entity_id,occurred_at,details")
      .eq("operation_id", result.data.operation_id).single();
    assert.ifError(event.error);
    assert.equal(event.data.actor_id, admin.id);
    assert.equal(event.data.event_type, "inventory_adjustment");
    assert.equal(event.data.entity_type, "inventory");
    assert.equal(event.data.entity_id, itemId);
    assert.ok(Number.isFinite(Date.parse(event.data.occurred_at)));
    assert.ok(Date.parse(event.data.occurred_at) > Date.parse("2026-10-01T00:00:00Z"));
    assert.equal(JSON.stringify(event.data.details).match(/password|token|secret/i), null);
    const adminRead = await actor.from("financial_audit_events").select("id").eq("id", event.data.id);
    assert.ifError(adminRead.error); assert.equal(adminRead.data.length, 1);

    const employeeActor = await signedIn(employee);
    const hidden = await employeeActor.from("financial_audit_events").select("id").eq("id", event.data.id);
    assert.equal(hidden.error, null);
    assert.equal(hidden.data.length, 0);
    const changed = await employeeActor.from("financial_audit_events").update({ event_type: "forged" }).eq("id", event.data.id);
    assert.ok(changed.error);
    const inserted = await employeeActor.from("financial_audit_events").insert({ operation_id: event.data.operation_id,
      actor_id: employee.id, event_type: "forged", entity_type: "inventory", entity_id: itemId });
    assert.ok(inserted.error);
    const deleted = await employeeActor.from("financial_audit_events").delete().eq("id", event.data.id);
    assert.ok(deleted.error);
    const stillThere = await service.from("financial_audit_events").select("id,event_type").eq("id", event.data.id).single();
    assert.equal(stillThere.data.event_type, "inventory_adjustment");
  });

  test("administrator annulment is concurrent-idempotent, compensates stock, and preserves the original", async () => {
    const actor = await signedIn(admin);
    const before = await service.from("inventory").select("quantity").eq("id", itemId).single();
    assert.ifError(before.error);
    const stocked = await actor.rpc("adjust_inventory", { p_request: {
      idempotency_key: crypto.randomUUID(), item_id: itemId, delta: 1, reason: "Synthetic annulment stock",
    } });
    assert.ifError(stocked.error);
    const posted = await actor.rpc("post_sale", { p_request: {
      idempotency_key: crypto.randomUUID(), client_id: clientId, payment_type: "contado",
      lines: [{ item_id: itemId, quantity: 1, expected_unit_price: "100.00" }],
    } });
    assert.ifError(posted.error);
    const annulRequest = { idempotency_key: crypto.randomUUID(), document_type: "sale", document_id: posted.data.sale_id,
      reason: "Synthetic local correction" };
    const attempts = await Promise.all([
      actor.rpc("annul_financial_document", { p_request: annulRequest }),
      actor.rpc("annul_financial_document", { p_request: annulRequest }),
    ]);
    assert.ifError(attempts[0].error); assert.ifError(attempts[1].error);
    assert.deepEqual(attempts[0].data, attempts[1].data);
    const original = await service.from("sales").select("id,total,voided_at,voided_by,void_reason").eq("id", posted.data.sale_id).single();
    assert.ifError(original.error); assert.equal(original.data.total, 100); assert.equal(original.data.voided_by, admin.id);
    assert.equal(original.data.void_reason, "Synthetic local correction"); assert.ok(original.data.voided_at);
    const savedLine = await service.from("sale_lines").select("unit_price,quantity").eq("sale_id", posted.data.sale_id).single();
    assert.ifError(savedLine.error); assert.deepEqual(savedLine.data, { unit_price: 100, quantity: 1 });
    const reportRows = await service.from("sales").select("total,voided_at").eq("id", posted.data.sale_id);
    assert.ifError(reportRows.error);
    assert.equal(reportRows.data.filter((row) => !row.voided_at).reduce((sum, row) => sum + row.total, 0), 0);
    const stock = await service.from("inventory").select("quantity").eq("id", itemId).single();
    assert.equal(stock.data.quantity, before.data.quantity + 1);
    const compensation = await service.from("financial_compensations").select("amount,reason,original_id")
      .eq("operation_id", attempts[0].data.operation_id).single();
    assert.ifError(compensation.error); assert.equal(compensation.data.amount, 100); assert.equal(compensation.data.original_id, posted.data.sale_id);
    const employeeActor = await signedIn(employee);
    const denied = await employeeActor.rpc("annul_financial_document", { p_request: { ...annulRequest, idempotency_key: crypto.randomUUID() } });
    assert.equal(denied.error?.code, "42501");
    const deletion = await employeeActor.from("sales").delete().eq("id", posted.data.sale_id);
    assert.ok(deletion.error);
    const audit = await service.from("financial_audit_events").select("event_type,actor_id,entity_id")
      .eq("operation_id", attempts[0].data.operation_id).single();
    assert.ifError(audit.error); assert.equal(audit.data.event_type, "financial_annulment");
    assert.equal(audit.data.actor_id, admin.id); assert.equal(audit.data.entity_id, posted.data.sale_id);
  });

  test("purchase annulment rejects insufficient remaining stock, then reverses stock once", async () => {
    const actor = await signedIn(admin);
    const before = await service.from("inventory").select("quantity").eq("id", itemId).single();
    const purchase = await actor.rpc("post_purchase", { p_request: {
      idempotency_key: crypto.randomUUID(), supplier_name: `Synthetic CHG-08 ${suffix}`, item_id: itemId,
      quantity: 2, unit_cost: "4.00", restock: true, payment_type: "contado",
    } });
    assert.ifError(purchase.error);
    const sale = await actor.rpc("post_sale", { p_request: {
      idempotency_key: crypto.randomUUID(), client_id: clientId, payment_type: "contado",
      lines: [{ item_id: itemId, quantity: before.data.quantity + 1, expected_unit_price: "100.00" }],
    } });
    assert.ifError(sale.error);
    const key = crypto.randomUUID();
    const blocked = await actor.rpc("annul_financial_document", { p_request: {
      idempotency_key: key, document_type: "purchase", document_id: purchase.data.purchase_id, reason: "Synthetic stock shortage",
    } });
    assert.equal(blocked.error?.code, "23514");
    const unchanged = await service.from("inventory").select("quantity").eq("id", itemId).single();
    assert.equal(unchanged.data.quantity, 1);
    const added = await actor.rpc("adjust_inventory", { p_request: {
      idempotency_key: crypto.randomUUID(), item_id: itemId, delta: 1, reason: "Synthetic stock reconciliation",
    } });
    assert.ifError(added.error);
    const annulled = await actor.rpc("annul_financial_document", { p_request: {
      idempotency_key: crypto.randomUUID(), document_type: "purchase", document_id: purchase.data.purchase_id, reason: "Synthetic purchase correction",
    } });
    assert.ifError(annulled.error);
    const finalStock = await service.from("inventory").select("quantity").eq("id", itemId).single();
    assert.equal(finalStock.data.quantity, 0);
    const original = await service.from("purchases").select("total,voided_at,void_reason").eq("id", purchase.data.purchase_id).single();
    assert.ifError(original.error); assert.equal(original.data.total, 8); assert.equal(original.data.void_reason, "Synthetic purchase correction");
    assert.ok(original.data.voided_at);
  });

  test("full payment reversal preserves payment history and permits balance-safe annulment", async () => {
    const actor = await signedIn(admin);
    const seeded = await actor.rpc("adjust_inventory", { p_request: {
      idempotency_key: crypto.randomUUID(), item_id: itemId, delta: 1, reason: "Synthetic payment reversal stock",
    } });
    assert.ifError(seeded.error);
    const posted = await actor.rpc("post_sale", { p_request: {
      idempotency_key: crypto.randomUUID(), client_id: clientId, payment_type: "credito",
      lines: [{ item_id: itemId, quantity: 1, expected_unit_price: "100.00" }],
    } });
    assert.ifError(posted.error);
    const paid = await actor.rpc("post_credit_payment", { p_request: {
      idempotency_key: crypto.randomUUID(), credit_type: "client", credit_id: posted.data.client_credit_id, amount: "25.00",
    } });
    assert.ifError(paid.error);
    const rejected = await actor.rpc("annul_financial_document", { p_request: {
      idempotency_key: crypto.randomUUID(), document_type: "sale", document_id: posted.data.sale_id, reason: "Before payment reversal",
    } });
    assert.equal(rejected.error?.code, "23514");
    const reversed = await actor.rpc("reverse_credit_payment", { p_request: {
      idempotency_key: crypto.randomUUID(), payment_id: paid.data.payment_id, reason: "Synthetic reconciliation",
    } });
    assert.ifError(reversed.error);
    const net = await service.from("client_credits").select("total,paid,balance,voided_principal,status").eq("id", posted.data.client_credit_id).single();
    assert.ifError(net.error); assert.deepEqual(net.data, { total: 100, paid: 0, balance: 100, voided_principal: 0, status: "pendiente" });
    const annulled = await actor.rpc("annul_financial_document", { p_request: {
      idempotency_key: crypto.randomUUID(), document_type: "sale", document_id: posted.data.sale_id, reason: "Synthetic after reversal",
    } });
    assert.ifError(annulled.error);
    const finalCredit = await service.from("client_credits").select("total,paid,balance,voided_principal,status").eq("id", posted.data.client_credit_id).single();
    assert.deepEqual(finalCredit.data, { total: 100, paid: 0, balance: 0, voided_principal: 100, status: "anulada" });
    const history = await service.from("credit_payments").select("id,amount").eq("id", paid.data.payment_id).single();
    assert.ifError(history.error); assert.equal(history.data.amount, 25);
  });

  test("expense posting is audited, direct mutation is denied, and authorized annulment preserves it", async () => {
    const actor = await signedIn(admin);
    const key = crypto.randomUUID();
    const posted = await actor.rpc("post_expense", { p_request: {
      idempotency_key: key, concept: "Synthetic audit expense", category: "otros", amount: "8.50",
      payment_method: "efectivo", beneficiary: "Synthetic fixture", date: "2026-10-22",
    } });
    assert.ifError(posted.error);
    const audit = await service.from("financial_audit_events").select("actor_id,event_type,entity_id")
      .eq("operation_id", posted.data.operation_id).single();
    assert.ifError(audit.error); assert.equal(audit.data.actor_id, admin.id); assert.equal(audit.data.event_type, "expense");
    assert.equal(audit.data.entity_id, posted.data.expense_id);
    const directUpdate = await actor.from("expenses").update({ amount: 1 }).eq("id", posted.data.expense_id);
    assert.ok(directUpdate.error);
    const annulled = await actor.rpc("annul_financial_document", { p_request: {
      idempotency_key: crypto.randomUUID(), document_type: "expense", document_id: posted.data.expense_id, reason: "Synthetic local expense correction",
    } });
    assert.ifError(annulled.error);
    const original = await service.from("expenses").select("amount,status,void_reason,voided_by").eq("id", posted.data.expense_id).single();
    assert.ifError(original.error); assert.deepEqual(original.data, { amount: 8.5, status: "anulado", void_reason: "Synthetic local expense correction", voided_by: admin.id });
  });

  test("audit insertion failure rolls back the financial operation and its stock change", async () => {
    const actor = await signedIn(admin);
    const before = await service.from("inventory").select("quantity").eq("id", itemId).single();
    const key = crypto.randomUUID();
    directPostgres(`CREATE OR REPLACE FUNCTION public.chg08_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$; CREATE TRIGGER chg08_test_reject_audit BEFORE INSERT ON public.financial_audit_events FOR EACH ROW EXECUTE FUNCTION public.chg08_test_reject_audit();`);
    try {
      const failed = await actor.rpc("adjust_inventory", { p_request: {
        idempotency_key: key, item_id: itemId, delta: 1, reason: "Injected audit rollback",
      } });
      assert.ok(failed.error);
    } finally {
      directPostgres("DROP TRIGGER IF EXISTS chg08_test_reject_audit ON public.financial_audit_events; DROP FUNCTION IF EXISTS public.chg08_test_reject_audit();");
    }
    const after = await service.from("inventory").select("quantity").eq("id", itemId).single();
    assert.equal(after.data.quantity, before.data.quantity);
    const operation = await service.from("business_operations").select("id").eq("actor_id", admin.id).eq("operation_type", "inventory_adjustment").eq("idempotency_key", key);
    assert.equal(operation.data.length, 0);
  });
});
