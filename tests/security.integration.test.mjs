import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { executeAndReconcile, PersistenceError, serializeMutation } from "../src/lib/persistence.js";

const enabled = process.env.RUN_LOCAL_SECURITY_INTEGRATION === "1";
const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.LOCAL_SUPABASE_JWT_SECRET;
const mailpitUrl = process.env.LOCAL_MAILPIT_URL;
const password = `Local-${crypto.randomUUID()}-9a!`;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const identities = {};
const clientIds = [];
const inventoryIds = [];
const supplierIds = [];
const expenseIds = [];
const provisioningIdentityIds = [];
const lastAdminTestId = "security-last-admin-test";
const provisioningIncidentIds = [];
let seedClientId;
let seedInventoryId;
let seedSaleId;
let seedSaleLineId;
let seedPurchaseId;
let seedClientCreditId;
let seedSupplierCreditId;
let seedClientPaymentId;
let seedSupplierPaymentId;
let seedExpenseId;
const service = enabled && url && serviceKey
  ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function authLinkFromMailpit(detail, expectedType) {
  for (const body of [detail.Text, detail.HTML]) {
    if (typeof body !== "string") continue;
    for (const match of body.matchAll(/https?:\/\/[^\s"<>]+/g)) {
      try {
        const link = new URL(match[0].replaceAll("&amp;", "&"));
        if (link.pathname === "/auth/v1/verify" && link.searchParams.get("type") === expectedType) return link;
      } catch {
        // Ignore non-URL fragments in the email body.
      }
    }
  }
  return null;
}

const security = test.describe("local Supabase Auth and RLS", { skip: !enabled }, () => {
  before(async () => {
    assert.ok(url && anonKey && serviceKey, "local Supabase URL and keys are required");
    const fixedAdminUsername = "__security_admin__";
    const fixedAdminEmail = "security-admin@example.test";
    const { data: previousAdmin } = await service
      .from("user_profiles")
      .select("auth_user_id")
      .eq("normalized_username", fixedAdminUsername)
      .maybeSingle();
    let adminId;
    if (previousAdmin) {
      adminId = previousAdmin.auth_user_id;
      const reset = await service.auth.admin.updateUserById(adminId, { password, email_confirm: true, ban_duration: "none" });
      assert.ifError(reset.error);
      const profile = await service.from("user_profiles").update({ role: "admin", active: true }).eq("auth_user_id", adminId);
      assert.ifError(profile.error);
    } else {
      const created = await service.auth.admin.createUser({ email: fixedAdminEmail, password, email_confirm: true });
      assert.ifError(created.error);
      adminId = created.data.user.id;
      const profile = await service.from("user_profiles").insert({
        auth_user_id: adminId,
        username: fixedAdminUsername,
        name: "Synthetic Security Admin",
        role: "admin",
        permissions: ["dashboard", "clients", "suppliers", "inventory", "sales", "purchases", "expenses", "settings"],
        active: true,
      });
      assert.ifError(profile.error);
    }
    identities.admin = { id: adminId, email: fixedAdminEmail, username: fixedAdminUsername };

    for (const item of [
      { key: "sales", role: "employee", permissions: ["sales"] },
      { key: "clients", role: "employee", permissions: ["clients"] },
      { key: "suppliers", role: "employee", permissions: ["suppliers"] },
      { key: "purchases", role: "employee", permissions: ["purchases"] },
      { key: "expenses", role: "employee", permissions: ["expenses"] },
      { key: "inventory", role: "employee", permissions: ["inventory"] },
      { key: "none", role: "employee", permissions: [] },
      { key: "revoked", role: "employee", permissions: ["clients"] },
    ]) {
      const email = `security-${item.key}-${suffix}@example.test`;
      const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
      assert.ifError(created.error);
      identities[item.key] = { id: created.data.user.id, email, username: `${item.key}-${suffix}` };
      const profile = await service.from("user_profiles").insert({
        auth_user_id: created.data.user.id,
        username: identities[item.key].username,
        name: `Synthetic ${item.key}`,
        role: item.role,
        permissions: item.permissions,
        active: true,
      });
      assert.ifError(profile.error);
    }
    const unverified = await service.auth.admin.createUser({
      email: `security-unverified-${suffix}@example.test`,
      password,
      email_confirm: false,
    });
    assert.ifError(unverified.error);
    identities.unverified = {
      id: unverified.data.user.id,
      email: `security-unverified-${suffix}@example.test`,
      username: `unverified-${suffix}`,
    };
    const inactiveProfile = await service.from("user_profiles").insert({
      auth_user_id: identities.unverified.id,
      username: identities.unverified.username,
      name: "Synthetic unverified",
      role: "employee",
      permissions: ["sales"],
      active: false,
    });
    assert.ifError(inactiveProfile.error);
    const seed = await service.from("clients").insert({ name: `CHG security fixture ${suffix}` }).select("id").single();
    assert.ifError(seed.error);
    seedClientId = seed.data.id;
    const inventorySeed = await service.from("inventory").insert({
      sku: `SEC-${suffix}`,
      kind: "joya",
      name: `CHG security inventory ${suffix}`,
      category: "otro",
      cost_price: 8,
      price: 20,
      quantity: 0,
    }).select("id").single();
    assert.ifError(inventorySeed.error);
    seedInventoryId = inventorySeed.data.id;
    const supplierSeed = await service.from("suppliers").insert({ name: `CHG security supplier ${suffix}` }).select("id").single();
    assert.ifError(supplierSeed.error);
    supplierIds.push(supplierSeed.data.id);
    const saleSeed = await service.from("sales").insert({
      receipt_no: `SEC-${suffix}`,
      client_id: seedClientId,
      subtotal: 2,
      tax_rate: 0,
      tax: 0,
      total: 2,
    }).select("id").single();
    assert.ifError(saleSeed.error);
    seedSaleId = saleSeed.data.id;
    const saleLineSeed = await service.from("sale_lines").insert({
      sale_id: seedSaleId,
      item_id: seedInventoryId,
      sku: `SEC-${suffix}`,
      name: `CHG security inventory ${suffix}`,
      unit_price: 2,
      quantity: 1,
    }).select("id").single();
    assert.ifError(saleLineSeed.error);
    seedSaleLineId = saleLineSeed.data.id;
    const purchaseSeed = await service.from("purchases").insert({
      supplier: `CHG security supplier ${suffix}`,
      supplier_id: supplierSeed.data.id,
      item_id: seedInventoryId,
      description: "Synthetic purchase authorization fixture",
      quantity: 1,
      unit_cost: 1,
      total: 1,
      payment_type: "contado",
    }).select("id").single();
    assert.ifError(purchaseSeed.error);
    seedPurchaseId = purchaseSeed.data.id;
    const clientCreditSeed = await service.from("client_credits").insert({
      sale_id: seedSaleId,
      client_id: seedClientId,
      receipt_no: `SEC-${suffix}`,
      total: 2,
      paid: 0,
      balance: 2,
      status: "pendiente",
    }).select("id").single();
    assert.ifError(clientCreditSeed.error);
    seedClientCreditId = clientCreditSeed.data.id;
    const supplierCreditSeed = await service.from("supplier_credits").insert({
      purchase_id: seedPurchaseId,
      supplier_id: supplierSeed.data.id,
      supplier_name: `CHG security supplier ${suffix}`,
      invoice_no: `SEC-${suffix}`,
      total: 1,
      paid: 0,
      balance: 1,
      status: "pendiente",
    }).select("id").single();
    assert.ifError(supplierCreditSeed.error);
    seedSupplierCreditId = supplierCreditSeed.data.id;
    const clientPaymentSeed = await service.from("credit_payments").insert({
      client_credit_id: seedClientCreditId,
      amount: 0.5,
      method: "efectivo",
    }).select("id").single();
    assert.ifError(clientPaymentSeed.error);
    seedClientPaymentId = clientPaymentSeed.data.id;
    const supplierPaymentSeed = await service.from("credit_payments").insert({
      supplier_credit_id: seedSupplierCreditId,
      amount: 0.5,
      method: "efectivo",
    }).select("id").single();
    assert.ifError(supplierPaymentSeed.error);
    seedSupplierPaymentId = supplierPaymentSeed.data.id;
    const expenseAdmin = await signedIn(identities.admin);
    const expenseSeed = await expenseAdmin.rpc("post_expense", { p_request: {
      idempotency_key: crypto.randomUUID(), concept: `CHG security expense ${suffix}`,
      category: "otros", amount: "1.00", payment_method: "efectivo", beneficiary: "synthetic",
    } });
    assert.ifError(expenseSeed.error);
    seedExpenseId = expenseSeed.data.expense_id;
    expenseIds.push(seedExpenseId);
  });

  after(async () => {
    if (!service) return;
    if (seedClientPaymentId) await service.from("credit_payments").delete().eq("id", seedClientPaymentId);
    if (seedSupplierPaymentId) await service.from("credit_payments").delete().eq("id", seedSupplierPaymentId);
    if (seedClientCreditId) await service.from("client_credits").delete().eq("id", seedClientCreditId);
    if (seedSupplierCreditId) await service.from("supplier_credits").delete().eq("id", seedSupplierCreditId);
    if (seedSaleLineId) await service.from("sale_lines").delete().eq("id", seedSaleLineId);
    if (seedSaleId) await service.from("sales").delete().eq("id", seedSaleId);
    if (seedPurchaseId) await service.from("purchases").delete().eq("id", seedPurchaseId);
    const allClientIds = [...clientIds, ...(seedClientId ? [seedClientId] : [])];
    if (allClientIds.length) await service.from("clients").delete().in("id", allClientIds);
    if (inventoryIds.length || seedInventoryId) {
      await service.from("inventory").delete().in("id", [...inventoryIds, ...(seedInventoryId ? [seedInventoryId] : [])]);
    }
    if (supplierIds.length) await service.from("suppliers").delete().in("id", supplierIds);
    if (identities.admin) {
      await service.from("user_profiles").update({ role: "admin", active: true }).eq("auth_user_id", identities.admin.id);
    }
    const expenseAdmin = await signedIn(identities.admin);
    for (const expenseId of expenseIds) {
      const expense = await service.from("expenses").select("status").eq("id", expenseId).maybeSingle();
      if (!expense.error && expense.data?.status === "registrado") {
        await expenseAdmin.rpc("annul_financial_document", { p_request: {
          idempotency_key: crypto.randomUUID(), document_type: "expense", document_id: expenseId,
          reason: "Synthetic Auth/RLS fixture cleanup",
        } });
      }
    }
    if (provisioningIncidentIds.length) await service.from("provisioning_incidents").delete().in("id", provisioningIncidentIds);
    for (const authId of provisioningIdentityIds) await service.auth.admin.deleteUser(authId);
    for (const [key, identity] of Object.entries(identities)) {
      if (key === "admin") continue;
      const profileRemoval = await service.from("user_profiles").delete().eq("auth_user_id", identity.id);
      if (profileRemoval.error) {
        const revokeProfile = await service.from("user_profiles").update({ active: false }).eq("auth_user_id", identity.id);
        assert.ifError(revokeProfile.error);
      }
      const authRemoval = await service.auth.admin.deleteUser(identity.id);
      if (authRemoval.error) {
        // CHG-08 audit rows retain their Auth actor FK; preserve history but make the test identity unusable.
        const ban = await service.auth.admin.updateUserById(identity.id, { ban_duration: "876000h" });
        assert.ifError(ban.error);
      }
    }
  });

  async function signedIn(identity) {
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await client.auth.signInWithPassword({ email: identity.email, password });
    assert.ifError(result.error);
    return client;
  }

  test("real Auth users can write and read back a client through authorized RLS", async () => {
    const client = await signedIn(identities.clients);
    const ownProfile = await client.from("user_profiles")
      .select("auth_user_id,username,role,permissions,active")
      .eq("auth_user_id", identities.clients.id)
      .single();
    assert.ifError(ownProfile.error);
    assert.equal(ownProfile.data.auth_user_id, identities.clients.id);
    const otherProfile = await client.from("user_profiles")
      .select("username")
      .eq("auth_user_id", identities.sales.id);
    assert.ifError(otherProfile.error);
    assert.deepEqual(otherProfile.data, []);

    const created = await client.from("clients").insert({ name: `CHG-01 ${suffix}` }).select("id,name").single();
    assert.ifError(created.error);
    clientIds.push(created.data.id);
    const reread = await client.from("clients").select("id,name").eq("id", created.data.id).single();
    assert.ifError(reread.error);
    assert.deepEqual(reread.data, created.data);
    const updated = await client.from("clients").update({ name: `CHG-01 updated ${suffix}` }).eq("id", created.data.id).select("id,name").single();
    assert.ifError(updated.error);
    assert.equal(updated.data.id, created.data.id);
    const removed = await client.from("clients").delete().eq("id", created.data.id).select("id").single();
    assert.ifError(removed.error);
    assert.equal(removed.data.id, created.data.id);
  });

  test("anonymous and sales-only sessions cannot read private clients or write them", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const anonRead = await anon.from("clients").select("id,name").limit(1);
    assert.ok(anonRead.error, "anon must have no table privilege");

    const sales = await signedIn(identities.sales);
    const restrictedRead = await sales.from("clients").select("id,name,email").limit(1);
    assert.equal(restrictedRead.error, null);
    assert.deepEqual(restrictedRead.data, []);
    const deniedWrite = await sales.from("clients").insert({ name: "must be denied" });
    assert.ok(deniedWrite.error, "sales-only actor must not mutate clients");
    const projection = await sales.from("sales_client_lookup").select("id,name,status").limit(1);
    assert.equal(projection.error, null);
    const anonProjection = await anon.from("sales_inventory_lookup").select("id").limit(1);
    assert.ok(anonProjection.error, "anon cannot query a protected lookup view");
    const falseSuccess = await service.from("clients").select("id").eq("name", "must be denied");
    assert.ifError(falseSuccess.error);
    assert.deepEqual(falseSuccess.data, [], "RLS-denied insert must leave no persisted row");
  });

  test("anonymous access is denied for every public table and protected view", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const tables = ["clients", "suppliers", "inventory", "sales", "sale_lines", "purchases", "client_credits", "supplier_credits", "credit_payments", "expenses", "settings", "user_profiles"];
    for (const table of tables) {
      const result = await anon.from(table).select("*").limit(1);
      assert.ok(result.error, `anon must not read public.${table}`);
      assert.ok((await anon.from(table).insert({})).error, `anon must not insert into public.${table}`);
      assert.ok((await anon.from(table).update({ id: crypto.randomUUID() }).eq("id", crypto.randomUUID())).error, `anon must not update public.${table}`);
      assert.ok((await anon.from(table).delete().eq("id", crypto.randomUUID())).error, `anon must not delete from public.${table}`);
    }
    const views = ["sales_client_lookup", "sales_inventory_lookup", "sales_receipt_settings", "purchases_supplier_lookup", "admin_inventory_catalog"];
    for (const view of views) {
      const result = await anon.from(view).select("*").limit(1);
      assert.ok(result.error, `anon must not read public.${view}`);
    }
    const privateRpc = await anon.rpc("has_permission", { required_permission: "sales" });
    assert.ok(privateRpc.error, "private authorization helper must not be callable through PostgREST");
    const moduleActor = await signedIn(identities.sales);
    const authenticatedPrivateRpc = await moduleActor.rpc("has_permission", { required_permission: "sales" });
    assert.ok(authenticatedPrivateRpc.error, "authenticated users cannot call private authorization helpers through PostgREST");
  });

  test("supplier, purchase and expense permissions stay in their own domains", async () => {
    const supplierActor = await signedIn(identities.suppliers);
    const supplierRead = await supplierActor.from("suppliers").select("id").in("id", supplierIds);
    assert.ifError(supplierRead.error);
    assert.deepEqual(supplierRead.data.map((row) => row.id), supplierIds);
    const clientActor = await signedIn(identities.clients);
    const crossDomain = await clientActor.from("suppliers").select("id").in("id", supplierIds);
    assert.ifError(crossDomain.error);
    assert.deepEqual(crossDomain.data, []);

    const purchasesActor = await signedIn(identities.purchases);
    const supplierLookup = await purchasesActor.from("purchases_supplier_lookup").select("id,name").in("id", supplierIds);
    assert.ifError(supplierLookup.error);
    assert.equal(supplierLookup.data.length, supplierIds.length);
    const inventoryLookup = await purchasesActor.from("sales_inventory_lookup").select("id,sku,name,price,quantity").eq("id", seedInventoryId).single();
    assert.ifError(inventoryLookup.error);

    const expenseActor = await signedIn(identities.expenses);
    const expenseRead = await expenseActor.from("expenses").select("id").in("id", expenseIds);
    assert.ifError(expenseRead.error);
    assert.deepEqual(expenseRead.data.map((row) => row.id), expenseIds);
    const forgedOwner = await expenseActor.from("expenses").update({ registered_by: "attacker" }).in("id", expenseIds);
    assert.ok(forgedOwner.error, "expense employees cannot forge the protected author column");
    const unauthorizedExpense = await supplierActor.from("expenses").select("id").in("id", expenseIds);
    assert.ifError(unauthorizedExpense.error);
    assert.deepEqual(unauthorizedExpense.data, []);
  });

  test("real relational fixtures prove row visibility for admin and each financial module", async () => {
    const admin = await signedIn(identities.admin);
    const readableFixtureIds = {
      clients: seedClientId,
      suppliers: supplierIds[0],
      inventory: seedInventoryId,
      sales: seedSaleId,
      sale_lines: seedSaleLineId,
      purchases: seedPurchaseId,
      client_credits: seedClientCreditId,
      supplier_credits: seedSupplierCreditId,
      credit_payments: seedClientPaymentId,
      expenses: expenseIds[0],
      settings: "00000000-0000-0000-0000-000000000001",
    };
    for (const [table, id] of Object.entries(readableFixtureIds)) {
      const result = await admin.from(table).select("id").eq("id", id).single();
      assert.ifError(result.error);
      assert.equal(result.data.id, id, `admin can read a populated ${table} fixture`);
    }
    const profile = await admin.from("user_profiles").select("auth_user_id,username,role").eq("auth_user_id", identities.clients.id).single();
    assert.ifError(profile.error);
    assert.equal(profile.data.role, "employee");

    const clientsActor = await signedIn(identities.clients);
    for (const [table, id] of [["sales", seedSaleId], ["sale_lines", seedSaleLineId], ["client_credits", seedClientCreditId], ["credit_payments", seedClientPaymentId]]) {
      const result = await clientsActor.from(table).select("id").eq("id", id).single();
      assert.ifError(result.error);
      assert.equal(result.data.id, id, `clients permission reads its ${table} relation`);
    }
    const hiddenSupplierPayment = await clientsActor.from("credit_payments").select("id").eq("id", seedSupplierPaymentId);
    assert.ifError(hiddenSupplierPayment.error);
    assert.deepEqual(hiddenSupplierPayment.data, [], "client permission does not cross into supplier payments");

    const suppliersActor = await signedIn(identities.suppliers);
    for (const [table, id] of [["purchases", seedPurchaseId], ["supplier_credits", seedSupplierCreditId], ["credit_payments", seedSupplierPaymentId]]) {
      const result = await suppliersActor.from(table).select("id").eq("id", id).single();
      assert.ifError(result.error);
      assert.equal(result.data.id, id, `suppliers permission reads its ${table} relation`);
    }
    const hiddenClientPayment = await suppliersActor.from("credit_payments").select("id").eq("id", seedClientPaymentId);
    assert.ifError(hiddenClientPayment.error);
    assert.deepEqual(hiddenClientPayment.data, [], "supplier permission does not cross into client payments");

    const purchasesActor = await signedIn(identities.purchases);
    const purchasesCredit = await purchasesActor.from("supplier_credits").select("id").eq("id", seedSupplierCreditId).single();
    assert.ifError(purchasesCredit.error);
    const purchasesPayment = await purchasesActor.from("credit_payments").select("id").eq("id", seedSupplierPaymentId).single();
    assert.ifError(purchasesPayment.error);
    const purchasesCannotReadClientCredit = await purchasesActor.from("client_credits").select("id").eq("id", seedClientCreditId);
    assert.ifError(purchasesCannotReadClientCredit.error);
    assert.deepEqual(purchasesCannotReadClientCredit.data, []);

    const salesActor = await signedIn(identities.sales);
    for (const [table, id] of [["sales", seedSaleId], ["sale_lines", seedSaleLineId]]) {
      const result = await salesActor.from(table).select("id").eq("id", id).single();
      assert.ifError(result.error);
      assert.equal(result.data.id, id);
    }
    for (const table of Object.keys(readableFixtureIds)) {
      if (["sales", "sale_lines", "settings", "inventory"].includes(table)) continue;
      const result = await salesActor.from(table).select("id").eq("id", readableFixtureIds[table]);
      assert.ifError(result.error);
      assert.deepEqual(result.data, [], `sales-only permission does not read ${table}`);
    }

    const noPermissionActor = await signedIn(identities.none);
    for (const [table, id] of Object.entries(readableFixtureIds)) {
      const result = await noPermissionActor.from(table).select("id").eq("id", id);
      assert.ifError(result.error);
      assert.deepEqual(result.data, [], `employee without permissions cannot read ${table}`);
    }
  });

  test("authorized module CRUD stays scoped and sensitive joins remain filtered", async () => {
    const supplierActor = await signedIn(identities.suppliers);
    const newSupplierId = crypto.randomUUID();
    const supplierInsert = await supplierActor.from("suppliers").insert({ id: newSupplierId, name: `CRUD supplier ${suffix}` }).select("id,name").single();
    assert.ifError(supplierInsert.error);
    supplierIds.push(newSupplierId);
    const supplierUpdate = await supplierActor.from("suppliers").update({ name: `CRUD supplier updated ${suffix}` }).eq("id", newSupplierId).select("id,name").single();
    assert.ifError(supplierUpdate.error);
    assert.equal(supplierUpdate.data.id, newSupplierId);
    const supplierDelete = await supplierActor.from("suppliers").delete().eq("id", newSupplierId).select("id").single();
    assert.ifError(supplierDelete.error);

    const inventoryActor = await signedIn(identities.inventory);
    const newInventoryId = crypto.randomUUID();
    const inventoryInsert = await inventoryActor.from("inventory").insert({
      id: newInventoryId, sku: `CRUD-${suffix}`, kind: "joya", name: "Synthetic CRUD item", category: "otro",
    }).select("id,name").single();
    assert.ifError(inventoryInsert.error);
    inventoryIds.push(newInventoryId);
    const inventoryUpdate = await inventoryActor.from("inventory").update({ name: "Synthetic CRUD item updated" }).eq("id", newInventoryId).select("id,name").single();
    assert.ifError(inventoryUpdate.error);
    assert.equal(inventoryUpdate.data.name, "Synthetic CRUD item updated");
    const inventoryDelete = await inventoryActor.from("inventory").delete().eq("id", newInventoryId);
    assert.ok(inventoryDelete.error, "inventory employees cannot bypass the stock/catalog delete workflow");

    const expenseActor = await signedIn(identities.expenses);
    const directExpenseId = crypto.randomUUID();
    const directExpenseInsert = await expenseActor.from("expenses").insert({
      id: directExpenseId, concept: `CRUD expense direct ${suffix}`, category: "otros", amount: 2,
      payment_method: "efectivo", beneficiary: "synthetic",
    }).select("id").single();
    assert.equal(directExpenseInsert.error?.code, "42501", "financial rows cannot be inserted directly");

    const expenseWriter = await signedIn(identities.admin);
    const expenseInsert = await expenseWriter.rpc("post_expense", { p_request: {
      idempotency_key: crypto.randomUUID(), concept: `CRUD expense RPC ${suffix}`, category: "otros",
      amount: "2.00", payment_method: "efectivo", beneficiary: "synthetic",
    } });
    assert.ifError(expenseInsert.error);
    const newExpenseId = expenseInsert.data.expense_id;
    expenseIds.push(newExpenseId);
    const persistedExpense = await expenseActor.from("expenses").select("id,registered_by").eq("id", newExpenseId).single();
    assert.ifError(persistedExpense.error);
    assert.equal(persistedExpense.data.registered_by, identities.admin.username, "RPC derives the author from verified identity");
    const expenseUpdate = await expenseActor.from("expenses").update({ amount: 3 }).eq("id", newExpenseId).select("id,amount").single();
    assert.equal(expenseUpdate.error?.code, "42501", "financial rows cannot be changed directly");
    const expenseDelete = await expenseActor.from("expenses").delete().eq("id", newExpenseId);
    assert.equal(expenseDelete.error?.code, "42501", "employees cannot delete financial evidence");

    const salesActor = await signedIn(identities.sales);
    const salesJoin = await salesActor.from("sales").select("id,clients(name,email)").eq("id", seedSaleId).single();
    assert.ifError(salesJoin.error);
    assert.equal(salesJoin.data.id, seedSaleId);
    assert.equal(salesJoin.data.clients, null, "sales cannot obtain client contact details through an embedded join");
    const purchasesActor = await signedIn(identities.purchases);
    const purchaseJoin = await purchasesActor.from("purchases").select("id,suppliers(name,email)").eq("id", seedPurchaseId).single();
    assert.ifError(purchaseJoin.error);
    assert.equal(purchaseJoin.data.id, seedPurchaseId);
    assert.equal(purchaseJoin.data.suppliers, null, "purchases cannot obtain supplier contact details through an embedded join");

    const admin = await signedIn(identities.admin);
    const adminProjection = await admin.from("admin_inventory_catalog").select("id,cost_price").eq("id", seedInventoryId).single();
    assert.ifError(adminProjection.error);
    assert.equal(Number(adminProjection.data.cost_price), 8);
    const hiddenProjection = await inventoryActor.from("admin_inventory_catalog").select("id,cost_price").eq("id", seedInventoryId);
    assert.ifError(hiddenProjection.error);
    assert.deepEqual(hiddenProjection.data, [], "the admin-only view does not elevate an inventory employee");
  });

  test("sales receives only receipt settings and employees cannot change business settings", async () => {
    const sales = await signedIn(identities.sales);
    const receiptSettings = await sales.from("sales_receipt_settings")
      .select("business_name,business_address,business_phone,tax_rate,currency").single();
    assert.ifError(receiptSettings.error);
    assert.equal(receiptSettings.data.currency, "DOP");
    const privateSettings = await sales.from("settings").select("*").limit(1);
    assert.ifError(privateSettings.error);
    assert.deepEqual(privateSettings.data, []);
    const denied = await sales.from("settings").update({ tax_rate: 0 })
      .eq("id", "00000000-0000-0000-0000-000000000001").select("tax_rate");
    assert.ifError(denied.error);
    assert.deepEqual(denied.data, [], "RLS-hidden update must not be treated as a confirmed write");
    const persistedSettings = await service.from("settings").select("tax_rate")
      .eq("id", "00000000-0000-0000-0000-000000000001").single();
    assert.ifError(persistedSettings.error);
    assert.equal(persistedSettings.data.tax_rate, 18);
    const admin = await signedIn(identities.admin);
    const changed = await admin.from("settings").update({ business_name: `CHG security ${suffix}` })
      .eq("id", "00000000-0000-0000-0000-000000000001").select("business_name").single();
    assert.ifError(changed.error);
    assert.equal(changed.data.business_name, `CHG security ${suffix}`);
    const restored = await admin.from("settings").update({ business_name: "GRACE SUPPLY" })
      .eq("id", "00000000-0000-0000-0000-000000000001").select("business_name").single();
    assert.ifError(restored.error);
  });

  test("administrators still cannot post financial rows directly", async () => {
    const admin = await signedIn(identities.admin);
    const denied = await admin.from("sales").insert({
      receipt_no: `blocked-${suffix}`,
      client_id: seedClientId,
      subtotal: 1,
      tax_rate: 0,
      tax: 0,
      total: 1,
    });
    assert.ok(denied.error, "financial writes remain closed until CHG-07");
    const update = await admin.from("sales").update({ total: 0 }).eq("receipt_no", `SEC-${suffix}`);
    assert.ok(update.error, "financial rows cannot be edited directly, even by administrators");
    const remove = await admin.from("sales").delete().eq("receipt_no", `SEC-${suffix}`);
    assert.ok(remove.error, "financial rows cannot be deleted directly, even by administrators");
  });

  test("financial tables, protected views, settings and profiles deny unapproved CRUD paths", async () => {
    const admin = await signedIn(identities.admin);
    const financialTables = ["sales", "sale_lines", "purchases", "client_credits", "supplier_credits", "credit_payments"];
    for (const table of financialTables) {
      const id = crypto.randomUUID();
      const insert = await admin.from(table).insert({ id });
      assert.ok(insert.error, `admin INSERT on ${table} remains closed until approved RPC operations exist`);
      const update = await admin.from(table).update({ id: crypto.randomUUID() }).eq("id", id);
      assert.ok(update.error, `admin UPDATE on ${table} remains closed`);
      const remove = await admin.from(table).delete().eq("id", id);
      assert.ok(remove.error, `admin DELETE on ${table} remains closed`);
    }
    const views = ["sales_client_lookup", "sales_inventory_lookup", "sales_receipt_settings", "purchases_supplier_lookup", "admin_inventory_catalog"];
    for (const view of views) {
      const id = crypto.randomUUID();
      const insert = await admin.from(view).insert({ id });
      assert.ok(insert.error, `INSERT on view ${view} must be denied`);
      const update = await admin.from(view).update({ id: crypto.randomUUID() }).eq("id", id);
      assert.ok(update.error, `UPDATE on view ${view} must be denied`);
      const remove = await admin.from(view).delete().eq("id", id);
      assert.ok(remove.error, `DELETE on view ${view} must be denied`);
    }
    const settingsInsert = await admin.from("settings").insert({ business_name: "forbidden" });
    const settingsDelete = await admin.from("settings").delete().eq("id", "00000000-0000-0000-0000-000000000001");
    assert.ok(settingsInsert.error);
    assert.ok(settingsDelete.error);
    const profileInsert = await admin.from("user_profiles").insert({ auth_user_id: crypto.randomUUID(), username: "forged", name: "forged" });
    const profileDelete = await admin.from("user_profiles").delete().eq("auth_user_id", identities.clients.id);
    assert.ok(profileInsert.error);
    assert.ok(profileDelete.error);
    const profile = await service.from("user_profiles").select("username,role,active").eq("auth_user_id", identities.clients.id).single();
    assert.ifError(profile.error);
    assert.equal(profile.data.role, "employee", "failed profile writes did not alter trusted identity data");
    assert.equal(profile.data.active, true);
  });

  test("sales receive only the limited inventory projection; employees cannot change pricing or stock", async () => {
    const sales = await signedIn(identities.sales);
    const projection = await sales.from("sales_inventory_lookup").select("*").eq("id", seedInventoryId).single();
    assert.equal(projection.error, null);
    assert.deepEqual(Object.keys(projection.data).sort(), ["id", "name", "price", "quantity", "sku"]);
    const hiddenBaseRows = await sales.from("inventory").select("id,cost_price").eq("id", seedInventoryId);
    assert.equal(hiddenBaseRows.error, null);
    assert.deepEqual(hiddenBaseRows.data, []);

    const inventoryEmployee = await signedIn(identities.inventory);
    const visible = await inventoryEmployee.from("inventory").select("id,cost_price,price,quantity").eq("id", seedInventoryId).single();
    assert.equal(visible.error, null);
    const priceChange = await inventoryEmployee.from("inventory").update({ price: 0 }).eq("id", seedInventoryId);
    assert.ok(priceChange.error, "inventory employees cannot alter catalog prices");
    const stockChange = await inventoryEmployee.from("inventory").update({ quantity: 1 }).eq("id", seedInventoryId);
    assert.ok(stockChange.error, "stock changes must use an authorized business operation");
  });

  test("administrators can update inventory prices through authenticated PostgreSQL access", async () => {
    const admin = await signedIn(identities.admin);
    const changed = await admin.from("inventory")
      .update({ price: 21.5, cost_price: 8.5 })
      .eq("id", seedInventoryId)
      .select("price,cost_price")
      .single();
    assert.ifError(changed.error);
    assert.deepEqual(changed.data, { price: 21.5, cost_price: 8.5 });
    const stockChange = await admin.from("inventory").update({ quantity: 1 }).eq("id", seedInventoryId);
    assert.ok(stockChange.error, "administrator cannot bypass the transactional stock boundary");
  });

  test("administrators manage profiles through the verified server function only", async () => {
    const admin = await signedIn(identities.admin);
    const { data: adminSession } = await admin.auth.getSession();
    const updated = await fetch(`${url}/functions/v1/manage-profile`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${adminSession.session.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "update", username: identities.sales.username, name: "Updated synthetic sales" }),
    });
    assert.equal(updated.status, 200);

    const employee = await signedIn(identities.sales);
    const { data: employeeSession } = await employee.auth.getSession();
    const denied = await fetch(`${url}/functions/v1/manage-profile`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${employeeSession.session.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "update", username: identities.clients.username, role: "admin" }),
    });
    assert.equal(denied.status, 403);
    const clientActor = await signedIn(identities.clients);
    const roleEscalation = await clientActor.from("user_profiles")
      .update({ role: "admin", permissions: ["dashboard", "clients", "suppliers", "inventory", "sales", "purchases", "expenses", "settings"] })
      .eq("auth_user_id", identities.clients.id);
    assert.ok(roleEscalation.error, "employees cannot elevate their own role or permissions through table DML");
    const unchangedProfile = await service.from("user_profiles").select("role,permissions").eq("auth_user_id", identities.clients.id).single();
    assert.ifError(unchangedProfile.error);
    assert.equal(unchangedProfile.data.role, "employee");
    assert.deepEqual(unchangedProfile.data.permissions, ["clients"]);
  });

  test("employee invitations are admin-only, start inactive and activate only after Auth email confirmation", async () => {
    const admin = await signedIn(identities.admin);
    const { data: sessionResult } = await admin.auth.getSession();
    const invoke = (payload) => fetch(`${url}/functions/v1/manage-profile`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${sessionResult.session.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const username = `invite-${suffix}`;
    const email = `security-invite-${suffix}@example.test`;
    const invitation = await invoke({ action: "invite_employee", username, name: "Synthetic invited employee", email });
    assert.equal(invitation.status, 202);
    const invitationBody = await invitation.json();
    assert.equal(invitationBody.profile.role, "employee", "admin endpoint cannot provision a new admin role");
    assert.equal(invitationBody.profile.active, false, "new employee remains inactive pending email confirmation and activation");
    assert.deepEqual(invitationBody.profile.permissions, ["sales"]);
    assert.equal(JSON.stringify(invitationBody).includes(email), false, "email is omitted from the returned profile");
    const profile = await service.from("user_profiles").select("auth_user_id,active,role").eq("normalized_username", username).single();
    assert.ifError(profile.error);
    identities.invited = { id: profile.data.auth_user_id, email, username };

    const activateEarly = await invoke({ action: "activate", username });
    assert.equal(activateEarly.status, 409, "unverified invited account cannot be activated");
    assert.ok(mailpitUrl);
    const inbox = await fetch(`${mailpitUrl}/api/v1/messages`);
    const { messages = [] } = await inbox.json();
    const inviteMessage = messages.find((message) => JSON.stringify(message).toLowerCase().includes(email.toLowerCase()));
    assert.ok(inviteMessage, "trusted admin invitation is delivered to Mailpit");
    const messageId = inviteMessage.ID ?? inviteMessage.Id ?? inviteMessage.id;
    const detail = await fetch(`${mailpitUrl}/api/v1/message/${encodeURIComponent(messageId)}`);
    assert.equal(detail.status, 200);
    const inviteEmailDetail = await detail.json();
    assert.match(JSON.stringify(inviteEmailDetail), /reset-password/i, "invitation link opens the password setup route");
    const invitationLink = authLinkFromMailpit(inviteEmailDetail, "invite");
    assert.ok(invitationLink, "Mailpit contains an official Supabase Auth invitation link");
    assert.ok(invitationLink.searchParams.get("token"));

    const inviteAuth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const invalidLink = await inviteAuth.auth.verifyOtp({ token_hash: `invalid-${suffix}`, type: "invite" });
    assert.ok(invalidLink.error, "invalid invitation links are rejected by Auth");
    const acceptedLink = await inviteAuth.auth.verifyOtp({ token_hash: invitationLink.searchParams.get("token"), type: "invite" });
    assert.ifError(acceptedLink.error);
    assert.equal(acceptedLink.data.user.id, profile.data.auth_user_id);
    const setPassword = await inviteAuth.auth.updateUser({ password });
    assert.ifError(setPassword.error);

    const activateConfirmed = await invoke({ action: "activate", username });
    assert.equal(activateConfirmed.status, 200);
    assert.equal((await activateConfirmed.json()).profile.active, true);
    const invitedLogin = await fetch(`${url}/functions/v1/username-login`, {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    assert.equal(invitedLogin.status, 200, "the invited employee can log in only after the official link confirms email and password");
  });

  test("profile persistence failure compensates Auth; failed compensation is recorded, blocks activation and is administratively recoverable", async () => {
    const admin = await signedIn(identities.admin);
    const { data: sessionResult } = await admin.auth.getSession();
    const invoke = (payload) => fetch(`${url}/functions/v1/manage-profile`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${sessionResult.session.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const compensatedUsername = `__chg04_test_fail_profile__${suffix}`;
    const compensatedEmail = `chg04-compensated-${suffix}@example.test`;
    const compensated = await invoke({
      action: "invite_employee", username: compensatedUsername,
      name: "Synthetic compensated employee", email: compensatedEmail,
    });
    assert.equal(compensated.status, 503, "a PostgreSQL profile constraint failure is not reported as successful creation");
    const compensatedBody = await compensated.json();
    assert.equal(compensatedBody.profile, undefined);
    assert.match(compensatedBody.error, /cancelled/i);
    const authPage = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    assert.ifError(authPage.error);
    const compensatedIdentity = authPage.data.users.find((candidate) => candidate.email === compensatedEmail);
    assert.equal(compensatedIdentity, undefined, "the trusted Edge Function deleted the partial Auth identity");
    const compensatedProfile = await service.from("user_profiles").select("auth_user_id")
      .eq("normalized_username", compensatedUsername).maybeSingle();
    assert.ifError(compensatedProfile.error);
    assert.equal(compensatedProfile.data, null, "no orphan profile remains after the failed insert");

    const recoverableUsername = `__chg04_test_fail_cleanup__${suffix}`;
    const recoverableEmail = `chg04-recoverable-${suffix}@example.test`;
    const failedCleanup = await invoke({
      action: "invite_employee", username: recoverableUsername,
      name: "Synthetic recoverable employee", email: recoverableEmail,
    });
    assert.equal(failedCleanup.status, 503, "failed compensation cannot return success");
    const failedCleanupBody = await failedCleanup.json();
    assert.equal(failedCleanupBody.profile, undefined);
    assert.ok(failedCleanupBody.incidentId, "the response carries a recoverable administrative incident reference");
    const failedAuthPage = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    assert.ifError(failedAuthPage.error);
    const partialIdentity = failedAuthPage.data.users.find((candidate) => candidate.email === recoverableEmail);
    assert.ok(partialIdentity, "controlled compensation failure leaves the Auth identity for administrative recovery");
    provisioningIdentityIds.push(partialIdentity.id);
    const orphanProfile = await service.from("user_profiles").select("auth_user_id")
      .eq("normalized_username", recoverableUsername).maybeSingle();
    assert.ifError(orphanProfile.error);
    assert.equal(orphanProfile.data, null, "the rejected profile write left no orphan profile");

    const incident = await service.from("provisioning_incidents").select("id,auth_user_id,username,status,details")
      .eq("id", failedCleanupBody.incidentId).single();
    assert.ifError(incident.error);
    assert.equal(incident.data.auth_user_id, partialIdentity.id);
    assert.equal(incident.data.username, recoverableUsername);
    assert.equal(incident.data.status, "open");
    assert.match(incident.data.details, /Profile persistence failed \(23514\).*Auth compensation failed/);
    provisioningIncidentIds.push(incident.data.id);

    const blockedActivation = await invoke({ action: "activate", username: recoverableUsername });
    assert.equal(blockedActivation.status, 423, "open provisioning incidents block account activation");
    assert.equal((await blockedActivation.json()).profile, undefined);

    const resolution = await invoke({ action: "resolve_provisioning_incident", username: recoverableUsername, incident_id: incident.data.id });
    assert.equal(resolution.status, 200, "a verified administrator can run the compensating cleanup");
    assert.equal((await resolution.json()).resolved, true);
    const afterResolution = await service.auth.admin.getUserById(partialIdentity.id);
    assert.ok(afterResolution.error, "the administrative resolution deleted the partial Auth identity");
    const finalProfile = await service.from("user_profiles").select("auth_user_id")
      .eq("normalized_username", recoverableUsername).maybeSingle();
    assert.ifError(finalProfile.error);
    assert.equal(finalProfile.data, null, "administrative recovery leaves no orphan profile");
    const resolvedIncident = await service.from("provisioning_incidents").select("status,resolved_by,resolved_at")
      .eq("id", incident.data.id).single();
    assert.ifError(resolvedIncident.error);
    assert.equal(resolvedIncident.data.status, "resolved");
    assert.equal(resolvedIncident.data.resolved_by, identities.admin.id);
    assert.ok(resolvedIncident.data.resolved_at);
  });

  test("PostgreSQL prevents revoking or demoting the last active administrator", async () => {
    const adminReady = await service.from("user_profiles").update({ role: "admin", active: true })
      .eq("auth_user_id", identities.admin.id);
    assert.ifError(adminReady.error);
    const transactionSql = `BEGIN;
LOCK TABLE public.user_profiles IN SHARE ROW EXCLUSIVE MODE;
UPDATE public.user_profiles SET active=false WHERE role='admin' AND active AND auth_user_id <> '${identities.admin.id}';
DO $$ DECLARE blocked boolean := false; BEGIN
  BEGIN
    UPDATE public.user_profiles SET active=false WHERE auth_user_id='${identities.admin.id}';
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'last_active_admin_guard_did_not_reject'; END IF;
END $$;
ROLLBACK;`;
    execFileSync("docker", ["exec", "supabase_db_jewel-sales-hub", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", transactionSql], { encoding: "utf8" });
  });

  test("unverified identities cannot be activated or obtain a session by username", async () => {
    const activate = await service
      .from("user_profiles")
      .update({ active: true })
      .eq("auth_user_id", identities.unverified.id);
    assert.equal(activate.error?.code, "23514");

    const login = await fetch(`${url}/functions/v1/username-login`, {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json" },
      body: JSON.stringify({ username: identities.unverified.username, password }),
    });
    assert.equal(login.status, 401);
    assert.deepEqual(await login.json(), { error: "Usuario o contraseña inválidos" });
  });

  test("a still-valid Auth token loses database access as soon as its profile is revoked", async () => {
    const adminProfile = await service.from("user_profiles").select("role,active").eq("auth_user_id", identities.admin.id).single();
    assert.ifError(adminProfile.error);
    const adminReady = await service.from("user_profiles").update({ role: "admin", active: true })
      .eq("auth_user_id", identities.admin.id);
    assert.ifError(adminReady.error);
    try {
      const client = await signedIn(identities.revoked);
      const { data: beforeRows, error: beforeError } = await client.from("clients").select("id").limit(1);
      assert.equal(beforeError, null);
      assert.ok(beforeRows.length >= 1);
      const admin = await signedIn(identities.admin);
      const { data: adminSession } = await admin.auth.getSession();
      const revoke = await fetch(`${url}/functions/v1/manage-profile`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${adminSession.session.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "revoke", username: identities.revoked.username }),
      });
      assert.equal(revoke.status, 200);
      const after = await client.from("clients").select("id").limit(1);
      assert.equal(after.error, null);
      assert.deepEqual(after.data, []);
    } finally {
      const restoreAdmin = await service.from("user_profiles").update(adminProfile.data)
        .eq("auth_user_id", identities.admin.id);
      assert.ifError(restoreAdmin.error);
    }
  });

  test("username login uses Auth and does not reveal account existence", async () => {
    const response = await fetch(`${url}/functions/v1/username-login`, {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json" },
      body: JSON.stringify({ username: identities.clients.username, password }),
    });
    assert.equal(response.status, 200);
    const session = await response.json();
    assert.ok(session.session?.access_token && session.session?.refresh_token);

    const invalid = await fetch(`${url}/functions/v1/username-login`, {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json" },
      body: JSON.stringify({ username: `missing-${suffix}`, password }),
    });
    const badPassword = await fetch(`${url}/functions/v1/username-login`, {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json" },
      body: JSON.stringify({ username: identities.clients.username, password: "wrong-password" }),
    });
    assert.equal(invalid.status, 401);
    assert.equal(badPassword.status, 401);
    assert.deepEqual(await invalid.json(), await badPassword.json());
  });

  test("username recovery returns a generic response and uses the verified Auth email", async () => {
    assert.ok(mailpitUrl, "local Mailpit URL is required to verify recovery delivery");
    const requestRecovery = (username) => fetch(`${url}/functions/v1/username-recovery`, {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const known = await requestRecovery(identities.clients.username);
    const unknown = await requestRecovery(`missing-${suffix}`);
    const repeatedKnown = await requestRecovery(identities.clients.username);
    assert.equal(known.status, 202);
    assert.equal(unknown.status, known.status);
    assert.equal(repeatedKnown.status, known.status);
    const knownBody = await known.json();
    const unknownBody = await unknown.json();
    const repeatedBody = await repeatedKnown.json();
    assert.deepEqual(knownBody, unknownBody, "existing and unknown usernames receive the same public response");
    assert.deepEqual(knownBody, repeatedBody, "rate-limited repeated recovery requests retain the same public response");
    assert.equal(JSON.stringify(knownBody).includes(identities.clients.email), false, "response never exposes the Auth email");

    const inbox = await fetch(`${mailpitUrl}/api/v1/messages`);
    assert.equal(inbox.status, 200);
    const { messages = [] } = await inbox.json();
    const targetMessages = messages.filter((message) => JSON.stringify(message).toLowerCase().includes(identities.clients.email.toLowerCase()));
    assert.equal(targetMessages.length, 1, "repeated requests are throttled by Auth email delivery limits");
    const recoveryMessage = targetMessages[0];
    assert.ok(recoveryMessage, "Supabase Auth delivered a recovery email to the individually verified address");
    const messageId = recoveryMessage.ID ?? recoveryMessage.Id ?? recoveryMessage.id;
    assert.ok(messageId, "Mailpit message ID is available for body verification");
    const detail = await fetch(`${mailpitUrl}/api/v1/message/${encodeURIComponent(messageId)}`);
    assert.equal(detail.status, 200);
    const email = await detail.json();
    const content = JSON.stringify(email);
    assert.match(content, /reset-password/i, "Auth recovery email targets the password reset route");
    const recoveryLink = authLinkFromMailpit(email, "recovery");
    assert.ok(recoveryLink, "Mailpit contains an official Supabase Auth recovery link");

    const recoveryAuth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const invalidLink = await recoveryAuth.auth.verifyOtp({ token_hash: `invalid-${suffix}`, type: "recovery" });
    assert.ok(invalidLink.error, "invalid recovery links are rejected by Auth");
    const acceptedLink = await recoveryAuth.auth.verifyOtp({ token_hash: recoveryLink.searchParams.get("token"), type: "recovery" });
    assert.ifError(acceptedLink.error);
    assert.equal(acceptedLink.data.user.id, identities.clients.id);

    const replacementPassword = `Recovered-${crypto.randomUUID()}-9b!`;
    const changed = await recoveryAuth.auth.updateUser({ password: replacementPassword });
    assert.ifError(changed.error);
    const oldLogin = await createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
      .auth.signInWithPassword({ email: identities.clients.email, password });
    assert.ok(oldLogin.error, "the replaced password no longer authenticates");
    const newLogin = await createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
      .auth.signInWithPassword({ email: identities.clients.email, password: replacementPassword });
    assert.ifError(newLogin.error);
    const signedOut = await recoveryAuth.auth.signOut({ scope: "local" });
    assert.ifError(signedOut.error);
    assert.ok((await recoveryAuth.auth.getUser()).error, "logout clears the recovery session");
    const restored = await service.auth.admin.updateUserById(identities.clients.id, { password });
    assert.ifError(restored.error);
  });

  test("public Auth signup is disabled", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await anon.auth.signUp({ email: `public-${suffix}@example.test`, password });
    assert.ok(result.error, "anon signup must be rejected");
    assert.match(result.error.message, /sign.?up|not allowed|disabled/i);
  });

  test("forged and expired Auth tokens cannot access PostgreSQL through REST", async () => {
    assert.ok(jwtSecret, "the local JWT signing secret is required for expiry testing");
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const header = encode({ alg: "HS256", typ: "JWT" });
    const expiredPayload = encode({
      aud: "authenticated",
      role: "authenticated",
      sub: identities.clients.id,
      iss: `${url}/auth/v1`,
      iat: 1,
      exp: 2,
    });
    const signingInput = `${header}.${expiredPayload}`;
    const expired = `${signingInput}.${createHmac("sha256", jwtSecret).update(signingInput).digest("base64url")}`;
    const forged = `${header}.${encode({ aud: "authenticated", role: "authenticated", sub: identities.clients.id, exp: 4102444800 })}.invalid`;
    for (const token of [expired, forged]) {
      const response = await fetch(`${url}/rest/v1/user_profiles?select=username`, {
        headers: { apikey: anonKey, authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 401);
    }
    const expiredAuth = await createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(expired);
    assert.ok(expiredAuth.error, "Supabase Auth rejects an expired session token directly");
  });

  test("real PostgreSQL SQL errors, lost responses, timeout reconciliation and ordered edits do not report false success", async () => {
    const authenticated = await signedIn(identities.clients);
    const { data: sessionData } = await authenticated.auth.getSession();
    const session = sessionData.session;
    const makeClient = (fetchImpl) => {
      const client = createClient(url, anonKey, {
        global: { fetch: fetchImpl },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      return client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token }).then(() => client);
    };
    const baseFetch = globalThis.fetch.bind(globalThis);
    const isClientWrite = (input, init) => {
      const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      return requestUrl.includes("/rest/v1/clients") && ["POST", "PATCH", "DELETE"].includes(method);
    };

    const sqlClient = await makeClient(baseFetch);
    const sqlFailure = await sqlClient.from("clients").insert({ name: null }).select("id");
    assert.ok(sqlFailure.error, "PostgreSQL must reject a NULL required field");
    assert.notEqual(sqlFailure.error.code, "42501", "this is a SQL constraint failure, not an RLS denial");

    const disconnectClient = await makeClient((input, init) => {
      if (isClientWrite(input, init)) throw new TypeError("synthetic connection loss before send");
      return baseFetch(input, init);
    });
    const disconnectedId = crypto.randomUUID();
    await assert.rejects(
      executeAndReconcile(
        () => disconnectClient.from("clients").insert({ id: disconnectedId, name: `disconnect-${suffix}` }).select("id").single(),
        () => disconnectClient.from("clients").select("id").eq("id", disconnectedId).maybeSingle(),
        { id: disconnectedId },
      ),
      (error) => error instanceof PersistenceError && error.kind === "uncertain",
    );
    const disconnectedCheck = await service.from("clients").select("id").eq("id", disconnectedId);
    assert.ifError(disconnectedCheck.error);
    assert.deepEqual(disconnectedCheck.data, [], "failed pre-send request left no row");

    const timedOutId = crypto.randomUUID();
    const timeoutResponses = [];
    const timeoutClient = await makeClient(async (input, init) => {
      const response = await baseFetch(input, init);
      if (isClientWrite(input, init)) {
        timeoutResponses.push({ status: response.status, body: await response.clone().text(), url: typeof input === "string" ? input.split("?")[0] : input.url.split("?")[0] });
        throw new TypeError("synthetic response loss after PostgreSQL committed");
      }
      return response;
    });
    let reconciled;
    try {
      reconciled = await executeAndReconcile(
        () => timeoutClient.from("clients").insert({ id: timedOutId, name: `timeout-${suffix}` }).select("id,name").single(),
        () => timeoutClient.from("clients").select("id,name").eq("id", timedOutId).maybeSingle(),
        { id: timedOutId },
      );
    } catch (error) {
      const persistedAfterTimeout = await service.from("clients").select("id,name").eq("id", timedOutId).maybeSingle();
      const authorizedReadAfterTimeout = await timeoutClient.from("clients").select("id,name").eq("id", timedOutId).maybeSingle();
      assert.fail(`timeout reconciliation failed; responses=${JSON.stringify(timeoutResponses)}; service=${JSON.stringify(persistedAfterTimeout)}; authorized=${JSON.stringify(authorizedReadAfterTimeout)}; cause=${String(error)}`);
    }
    assert.equal(reconciled.id, timedOutId, "readback confirms the same stable ID");
    const persisted = await service.from("clients").select("id,name").eq("id", timedOutId).single();
    assert.ifError(persisted.error);
    assert.deepEqual(persisted.data, reconciled, "confirmed form result matches PostgreSQL state");
    clientIds.push(timedOutId);

    const orderedId = crypto.randomUUID();
    const orderedClient = await makeClient(baseFetch);
    const inserted = await orderedClient.from("clients").insert({ id: orderedId, name: `ordered-initial-${suffix}` }).select("id").single();
    assert.ifError(inserted.error);
    clientIds.push(orderedId);
    const order = [];
    const first = serializeMutation(`clients:${orderedId}`, async () => {
      order.push("first-start");
      const result = await orderedClient.from("clients").update({ name: `ordered-first-${suffix}` }).eq("id", orderedId).select("id,name").single();
      assert.ifError(result.error);
      await new Promise((resolve) => setTimeout(resolve, 60));
      order.push("first-confirmed");
      return result.data;
    });
    const second = serializeMutation(`clients:${orderedId}`, async () => {
      order.push("second-start");
      const result = await orderedClient.from("clients").update({ name: `ordered-second-${suffix}` }).eq("id", orderedId).select("id,name").single();
      assert.ifError(result.error);
      order.push("second-confirmed");
      return result.data;
    });
    await Promise.all([first, second]);
    assert.ok(order.indexOf("first-confirmed") < order.indexOf("second-start"));
    const finalRow = await service.from("clients").select("id,name").eq("id", orderedId).single();
    assert.ifError(finalRow.error);
    assert.equal(finalRow.data.name, `ordered-second-${suffix}`);
  });
});
