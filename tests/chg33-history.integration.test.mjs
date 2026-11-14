import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test, { after, before } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { resolveHistoryDateRange } from "../src/lib/historyDateRange.js";

const enabled = process.env.RUN_CHG33_HISTORY_INTEGRATION === "1";
const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const databaseContainer = process.env.LOCAL_SUPABASE_CONTAINER;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const prefix = `CHG33-${suffix}`;
const password = `History-${crypto.randomUUID()}-a!`;
const accounts = new Map();
let service;
let clientId;
let supplierId;
let oldClientName;
let currentClientName;
let supplierSnapshot;
let saleRows = [];
let purchaseRows = [];
let boundarySales = [];
let boundaryPurchases = [];

const historySuite = test.describe(
  "CHG-33 local paginated history RPCs",
  { skip: !enabled },
  () => {
    before(async () => {
      assert.ok(url && anonKey && serviceKey, "dedicated local Supabase credentials are required");
      const parsedUrl = new URL(url);
      assert.ok(["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname));
      assert.equal(
        parsedUrl.port,
        "64221",
        "refusing a Supabase stack other than the CHG-33 test stack",
      );
      assert.equal(databaseContainer, "supabase_db_grace-chg33-hist1411");
      service = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      await preserveSyntheticAdminAndCleanPriorFixtures();

      const client = await service
        .from("clients")
        .insert({ name: `CHG33 client ${suffix}`, status: "activo" })
        .select("id,name")
        .single();
      assert.ifError(client.error);
      clientId = client.data.id;
      oldClientName = client.data.name;
      currentClientName = `CHG33 renamed client ${suffix}`;

      const supplier = await service
        .from("suppliers")
        .insert({ name: `CHG33 supplier ${suffix}`, status: "activo" })
        .select("id,name")
        .single();
      assert.ifError(supplier.error);
      supplierId = supplier.data.id;
      supplierSnapshot = supplier.data.name;

      for (const [key, permission] of [
        ["sales", "sales"],
        ["clients", "clients"],
        ["purchases", "purchases"],
        ["suppliers", "suppliers"],
        ["none", null],
        ["inactive", "sales"],
      ]) {
        const email = `chg33-${key}-${suffix}@example.test`;
        const created = await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        assert.ifError(created.error);
        accounts.set(key, { id: created.data.user.id, email, permission });
        const profile = await service.from("user_profiles").insert({
          auth_user_id: created.data.user.id,
          username: `chg33-${key}-${suffix}`,
          name: `Synthetic CHG-33 ${key}`,
          role: "employee",
          permissions: permission ? [permission] : [],
          active: key !== "inactive",
        });
        assert.ifError(profile.error);
      }

      const range = resolveHistoryDateRange({ period: "today" });
      const start = Date.parse(range.fromInclusive);
      const end = Date.parse(range.toExclusive);
      const base = end - 60_000;
      const generatedAt = (index) => new Date(base - Math.floor(index / 4) * 1000).toISOString();
      saleRows = Array.from({ length: 1007 }, (_, index) => ({
        receipt_no: `${prefix}-S-${String(index).padStart(4, "0")}`,
        client_id: clientId,
        subtotal: 100,
        tax_rate: 0,
        tax: 0,
        total: 100,
        payment_type: "contado",
        created_at: generatedAt(index),
      }));
      purchaseRows = Array.from({ length: 1007 }, (_, index) => ({
        supplier: supplierSnapshot,
        supplier_id: supplierId,
        description: `CHG-33 synthetic purchase ${index}`,
        quantity: 1,
        unit_cost: 100,
        total: 100,
        invoice_no: `${prefix}-P-${String(index).padStart(4, "0")}`,
        created_at: generatedAt(index),
      }));
      boundarySales = [start - 1, start, end - 1, end].map((timestamp, index) => ({
        receipt_no: `${prefix}-SB-${index}`,
        client_id: clientId,
        subtotal: 100,
        tax_rate: 0,
        tax: 0,
        total: 100,
        payment_type: "contado",
        created_at: new Date(timestamp).toISOString(),
      }));
      boundaryPurchases = [start - 1, start, end - 1, end].map((timestamp, index) => ({
        supplier: supplierSnapshot,
        supplier_id: supplierId,
        description: `CHG-33 boundary purchase ${index}`,
        quantity: 1,
        unit_cost: 100,
        total: 100,
        invoice_no: `${prefix}-PB-${index}`,
        created_at: new Date(timestamp).toISOString(),
      }));

      saleRows = await insertChunks("sales", [...saleRows, ...boundarySales]);
      purchaseRows = await insertChunks("purchases", [...purchaseRows, ...boundaryPurchases]);
    });

    after(async () => {
      if (!service) return;
      const salesCleanup = await service.from("sales").delete().like("receipt_no", `${prefix}-%`);
      assert.ifError(salesCleanup.error);
      const purchasesCleanup = await service
        .from("purchases")
        .delete()
        .like("invoice_no", `${prefix}-%`);
      assert.ifError(purchasesCleanup.error);
      if (clientId) {
        const result = await service.from("clients").delete().eq("id", clientId);
        assert.ifError(result.error);
      }
      if (supplierId) {
        const result = await service.from("suppliers").delete().eq("id", supplierId);
        assert.ifError(result.error);
      }
      for (const account of accounts.values()) {
        if (account.preserve) continue;
        const profile = await service.from("user_profiles").delete().eq("auth_user_id", account.id);
        assert.ifError(profile.error);
        const identity = await service.auth.admin.deleteUser(account.id);
        assert.ifError(identity.error);
      }
    });

    test("both endpoints traverse more than 1,000 rows without gaps, duplicates, or unstable ties", async () => {
      const salesClient = await signedIn("sales");
      const purchaseClient = await signedIn("purchases");
      for (const [table, client] of [
        ["sales", salesClient],
        ["purchases", purchaseClient],
      ]) {
        const seen = [];
        let expectedTotal = null;
        let page = 1;
        while (true) {
          const payload = await fetchPage(client, table, { p_search: prefix, p_page: page });
          expectedTotal ??= Number(payload.total_count);
          assert.equal(Number(payload.total_count), expectedTotal);
          assert.ok(Array.isArray(payload.records));
          assert.ok(payload.records.length <= 25);
          if (payload.records.length === 0) break;
          seen.push(...payload.records.map((record) => record.id));
          page += 1;
          assert.ok(page <= 100, "test fixture should fit the guarded page budget");
        }
        assert.equal(expectedTotal, 1011);
        assert.equal(seen.length, expectedTotal);
        assert.equal(new Set(seen).size, expectedTotal);

        const first = await fetchPage(client, table, { p_search: prefix, p_page: 1 });
        const expectedPage = [...(table === "sales" ? saleRows : purchaseRows)]
          .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
          .slice(0, 25)
          .map((record) => record.id);
        assert.deepEqual(
          first.records.map((record) => record.id),
          expectedPage,
        );

        const beyond = await fetchPage(client, table, { p_search: prefix, p_page: 999 });
        assert.equal(Number(beyond.total_count), 1011);
        assert.deepEqual(beyond.records, []);
      }
    });

    test("search is literal and preserves counterparty/snapshot references", async () => {
      const salesClient = await signedIn("sales");
      const clientsClient = await signedIn("clients");
      const purchaseClient = await signedIn("suppliers");
      const renamed = await service
        .from("clients")
        .update({ name: currentClientName })
        .eq("id", clientId);
      assert.ifError(renamed.error);
      const supplierRename = await service
        .from("suppliers")
        .update({ name: `CHG33 supplier edited ${suffix}` })
        .eq("id", supplierId);
      assert.ifError(supplierRename.error);

      for (const client of [salesClient, clientsClient]) {
        const byNewClientName = await fetchPage(client, "sales", {
          p_search: currentClientName,
          p_page: 1,
        });
        assert.equal(Number(byNewClientName.total_count), 1011);
      }
      const byReceipt = await fetchPage(salesClient, "sales", {
        p_search: `${prefix}-S-0000`,
        p_page: 1,
      });
      assert.equal(Number(byReceipt.total_count), 1);

      const bySupplierSnapshot = await fetchPage(purchaseClient, "purchases", {
        p_search: supplierSnapshot,
        p_page: 1,
      });
      assert.equal(Number(bySupplierSnapshot.total_count), 1011);
      const wildcardLiteral = await fetchPage(salesClient, "sales", {
        p_search: `${prefix}%_`,
        p_page: 1,
      });
      assert.equal(Number(wildcardLiteral.total_count), 0);

      const clientDelete = await service.from("clients").delete().eq("id", clientId);
      assert.equal(
        clientDelete.error?.code,
        "23503",
        "sales preserve their client reference via RESTRICT",
      );
      const supplierDelete = await service.from("suppliers").delete().eq("id", supplierId);
      assert.equal(
        supplierDelete.error?.code,
        "23503",
        "purchases preserve their supplier reference via RESTRICT",
      );
    });

    test("business date bounds include the entire final date and reject invalid ranges", async () => {
      const salesClient = await signedIn("sales");
      const purchaseClient = await signedIn("purchases");
      const range = resolveHistoryDateRange({ period: "today" });
      for (const [table, client] of [
        ["sales", salesClient],
        ["purchases", purchaseClient],
      ]) {
        const result = await fetchPage(client, table, {
          p_search: prefix,
          p_from: range.fromInclusive,
          p_to_exclusive: range.toExclusive,
          p_page: 1,
        });
        assert.equal(Number(result.total_count), 1009);
        const lowerBoundary = await fetchPage(client, table, {
          p_search: `${prefix}-${table === "sales" ? "SB-1" : "PB-1"}`,
          p_from: range.fromInclusive,
          p_to_exclusive: range.toExclusive,
        });
        const upperIncluded = await fetchPage(client, table, {
          p_search: `${prefix}-${table === "sales" ? "SB-2" : "PB-2"}`,
          p_from: range.fromInclusive,
          p_to_exclusive: range.toExclusive,
        });
        const outsideBefore = await fetchPage(client, table, {
          p_search: `${prefix}-${table === "sales" ? "SB-0" : "PB-0"}`,
          p_from: range.fromInclusive,
          p_to_exclusive: range.toExclusive,
        });
        const outsideAfter = await fetchPage(client, table, {
          p_search: `${prefix}-${table === "sales" ? "SB-3" : "PB-3"}`,
          p_from: range.fromInclusive,
          p_to_exclusive: range.toExclusive,
        });
        assert.equal(Number(lowerBoundary.total_count), 1);
        assert.equal(Number(upperIncluded.total_count), 1);
        assert.equal(
          Date.parse(lowerBoundary.records[0].created_at),
          Date.parse(range.fromInclusive),
        );
        assert.equal(
          Date.parse(upperIncluded.records[0].created_at),
          Date.parse(range.toExclusive) - 1,
        );
        assert.equal(Number(outsideBefore.total_count), 0);
        assert.equal(Number(outsideAfter.total_count), 0);

        const invalid = await client.rpc(rpcName(table), {
          p_search: prefix,
          p_from: range.toExclusive,
          p_to_exclusive: range.fromInclusive,
          p_page: 1,
        });
        assert.equal(invalid.error?.code, "22023");
      }
    });

    test("permission matrix rejects anon and authenticated callers without matching access", async () => {
      const anon = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      for (const table of ["sales", "purchases"]) {
        const anonymousResult = await anon.rpc(rpcName(table), { p_page: 1 });
        assert.ok(anonymousResult.error, `${table} RPC must reject anonymous calls`);
      }

      const none = await signedIn("none");
      const forbiddenSales = await none.rpc(rpcName("sales"), { p_page: 1 });
      const forbiddenPurchases = await none.rpc(rpcName("purchases"), { p_page: 1 });
      assert.equal(forbiddenSales.error?.code, "42501");
      assert.equal(forbiddenPurchases.error?.code, "42501");

      const salesOnly = await signedIn("sales");
      const purchasesOnly = await signedIn("purchases");
      const inactive = await signedIn("inactive");
      assert.equal((await salesOnly.rpc(rpcName("purchases"), { p_page: 1 })).error?.code, "42501");
      assert.equal((await purchasesOnly.rpc(rpcName("sales"), { p_page: 1 })).error?.code, "42501");
      assert.equal((await inactive.rpc(rpcName("sales"), { p_page: 1 })).error?.code, "42501");
      const admin = await signedIn("admin");
      assert.equal(Number((await fetchPage(admin, "sales", { p_page: 1 })).total_count) > 0, true);
      assert.equal(
        Number((await fetchPage(admin, "purchases", { p_page: 1 })).total_count) > 0,
        true,
      );
      assert.equal(
        Number((await fetchPage(await signedIn("clients"), "sales", { p_page: 1 })).total_count) >
          0,
        true,
      );
      assert.equal(
        Number(
          (await fetchPage(await signedIn("suppliers"), "purchases", { p_page: 1 })).total_count,
        ) > 0,
        true,
      );
    });

    test("the mounted manage-profile runtime authorizes list_employees and returns only directory fields", async () => {
      const admin = await signedIn("admin");
      const listed = await admin.functions.invoke("manage-profile", {
        body: { action: "list_employees" },
      });
      assert.ifError(listed.error);
      assert.ok(Array.isArray(listed.data?.profiles));
      assert.ok(listed.data.profiles.length > 0);
      assert.equal("auth_user_id" in listed.data.profiles[0], false);
      assert.equal("email" in listed.data.profiles[0], false);

      const employee = await signedIn("none");
      const denied = await employee.functions.invoke("manage-profile", {
        body: { action: "list_employees" },
      });
      assert.ok(denied.error, "non-admin list_employees call must be denied");
      assert.equal(denied.error.context.status, 403);
    });

    test("page query plans are measured on the synthetic history without a speculative index", () => {
      const explain = (table, column) =>
        execFileSync(
          "docker",
          [
            "exec",
            databaseContainer,
            "psql",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-Atqc",
            `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT id FROM public.${table} WHERE ${column} LIKE '${prefix}%' ORDER BY created_at DESC, id DESC LIMIT 25;`,
          ],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        );
      const summarize = (plan, name) => {
        assert.match(plan, /Execution Time: [\d.]+ ms/);
        const nodes = [
          ...plan.matchAll(/^\s*(?:->\s*)?(Seq Scan|Index Scan|Sort|Top-N Heap Sort).*$/gm),
        ]
          .map((match) => match[1])
          .filter((node, index, array) => array.indexOf(node) === index);
        const executionMs = /Execution Time: ([\d.]+) ms/.exec(plan)?.[1];
        console.log(`EXPLAIN ${name}: ${nodes.join(" + ")}; ${executionMs} ms`);
      };
      summarize(explain("sales", "receipt_no"), "sales");
      summarize(explain("purchases", "invoice_no"), "purchases");
    });
  },
);

async function insertChunks(table, rows) {
  const inserted = [];
  for (let index = 0; index < rows.length; index += 250) {
    const result = await service
      .from(table)
      .insert(rows.slice(index, index + 250))
      .select(table === "sales" ? "id,receipt_no,created_at" : "id,invoice_no,created_at");
    assert.ifError(result.error);
    inserted.push(...result.data);
  }
  return inserted;
}

async function preserveSyntheticAdminAndCleanPriorFixtures() {
  const existingAdmin = await service
    .from("user_profiles")
    .select("auth_user_id,username")
    .like("username", "chg33-admin-%")
    .limit(1)
    .maybeSingle();
  assert.ifError(existingAdmin.error);

  let admin;
  if (existingAdmin.data) {
    const identity = await service.auth.admin.getUserById(existingAdmin.data.auth_user_id);
    assert.ifError(identity.error);
    const updated = await service.auth.admin.updateUserById(existingAdmin.data.auth_user_id, {
      password,
      email_confirm: true,
      ban_duration: "none",
    });
    assert.ifError(updated.error);
    admin = {
      id: existingAdmin.data.auth_user_id,
      username: existingAdmin.data.username,
      email: identity.data.user.email,
    };
  } else {
    const email = `chg33-admin-${suffix}@example.test`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    const username = `chg33-admin-${suffix}`;
    admin = { id: created.data.user.id, email, username };
    const profile = await service.from("user_profiles").insert({
      auth_user_id: admin.id,
      username,
      name: "Synthetic CHG-33 local admin",
      role: "admin",
      permissions: [],
      active: true,
    });
    assert.ifError(profile.error);
  }
  accounts.set("admin", { ...admin, permission: null, preserve: true });

  const priorProfiles = await service
    .from("user_profiles")
    .select("auth_user_id,username,role,active")
    .like("username", "chg33-%");
  assert.ifError(priorProfiles.error);
  for (const profile of priorProfiles.data ?? []) {
    if (profile.auth_user_id === admin.id) continue;
    if (profile.role === "admin" && profile.active) {
      const demote = await service
        .from("user_profiles")
        .update({ role: "employee", active: false, permissions: [] })
        .eq("auth_user_id", profile.auth_user_id);
      assert.ifError(demote.error);
    }
    const removedProfile = await service
      .from("user_profiles")
      .delete()
      .eq("auth_user_id", profile.auth_user_id);
    assert.ifError(removedProfile.error);
    const removedIdentity = await service.auth.admin.deleteUser(profile.auth_user_id);
    assert.ifError(removedIdentity.error);
  }
}

async function signedIn(key) {
  const account = accounts.get(key);
  assert.ok(account, `synthetic ${key} account must exist`);
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await client.auth.signInWithPassword({ email: account.email, password });
  assert.ifError(result.error);
  return client;
}

function rpcName(table) {
  return table === "sales" ? "search_sales_history" : "search_purchases_history";
}

async function fetchPage(client, table, args) {
  const result = await client.rpc(rpcName(table), {
    p_search: null,
    p_from: null,
    p_to_exclusive: null,
    p_page: 1,
    ...args,
  });
  assert.ifError(result.error);
  assert.ok(result.data && typeof result.data === "object");
  assert.ok(Array.isArray(result.data.records));
  return result.data;
}

void historySuite;
