import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.RUN_CHG35_PURCHASE_INTEGRATION === "1";
const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const databaseContainer = process.env.LOCAL_SUPABASE_CONTAINER;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const password = `Local-${crypto.randomUUID()}-9a!`;
const service =
  enabled && url && serviceKey
    ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
let authorized;
let unauthorized;
let supplierId;
let historySupplierId;
let itemIds = [];
const authUserIds = [];

after(async () => {
  if (!service) return;
  const purchases = await service.from("purchases").select("id").ilike("invoice_no", `%${suffix}%`);
  if (!purchases.error && purchases.data.length) {
    const purchaseIds = purchases.data.map(({ id }) => id);
    await service.from("purchase_lines").delete().in("purchase_id", purchaseIds);
    await service.from("supplier_credits").delete().in("purchase_id", purchaseIds);
    await service.from("purchases").delete().in("id", purchaseIds);
  }
  if (itemIds.length) await service.from("inventory").delete().in("id", itemIds);
  if (historySupplierId) await service.from("suppliers").delete().eq("id", historySupplierId);
  if (supplierId) await service.from("suppliers").delete().eq("id", supplierId);
  for (const id of authUserIds) {
    await service.from("user_profiles").delete().eq("auth_user_id", id);
    await service.auth.admin.deleteUser(id);
  }
});

test(
  "CHG-35 local purchase line posting, security and annulment",
  { skip: !enabled },
  async (t) => {
    assert.ok(url && anonKey && serviceKey, "local Supabase URL and keys are required");
    assert.ok(["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname));
    assert.match(databaseContainer ?? "", /^supabase_db_chg35[a-z0-9]+$/);

    const supplier = await service
      .from("suppliers")
      .insert({ name: `CHG35 supplier ${suffix}` })
      .select("id")
      .single();
    assert.ifError(supplier.error);
    supplierId = supplier.data.id;

    const products = Array.from({ length: 120 }, (_, index) => ({
      sku: `CHG35-${suffix}-${index}`,
      kind: "joya",
      name: `CHG35 product ${suffix} ${index}`,
      category: "otro",
      cost_price: 2,
      price: 10,
      quantity: 0,
    }));
    const createdProducts = await service.from("inventory").insert(products).select("id");
    assert.ifError(createdProducts.error);
    itemIds = createdProducts.data.map((item) => item.id);

    const identities = [
      {
        key: "authorized",
        role: "admin",
        permissions: ["dashboard", "purchases", "suppliers", "inventory", "settings"],
      },
      { key: "unauthorized", role: "employee", permissions: ["dashboard"] },
    ];
    for (const identity of identities) {
      const email = `chg35-${identity.key}-${suffix}@example.test`;
      const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
      assert.ifError(created.error);
      authUserIds.push(created.data.user.id);
      const profile = await service.from("user_profiles").insert({
        auth_user_id: created.data.user.id,
        username: `chg35-${identity.key}-${suffix}`,
        name: `Synthetic CHG-35 ${identity.key}`,
        role: identity.role,
        permissions: identity.permissions,
        active: true,
      });
      assert.ifError(profile.error);
      const client = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const signedIn = await client.auth.signInWithPassword({ email, password });
      assert.ifError(signedIn.error);
      if (identity.key === "authorized") authorized = client;
      else unauthorized = client;
    }

    const baseRequest = (fields = {}) => ({
      idempotency_key: crypto.randomUUID(),
      supplier_id: supplierId,
      supplier_name: `CHG35 supplier ${suffix}`,
      description: `Synthetic CHG-35 ${suffix}`,
      payment_type: "contado",
      invoice_no: `CHG35-${suffix}-${crypto.randomUUID().slice(0, 6)}`,
      restock: true,
      ...fields,
    });
    const currentStock = async (ids) => {
      const result = await service.from("inventory").select("id,quantity").in("id", ids);
      assert.ifError(result.error);
      return Object.fromEntries(result.data.map((row) => [row.id, row.quantity]));
    };

    await t.test(
      "legacy scalar request remains idempotent and stores a product snapshot",
      async () => {
        const request = baseRequest({
          item_id: itemIds[0],
          quantity: 2,
          unit_cost: "7.25",
          restock: true,
        });
        const first = await authorized.rpc("post_purchase", { p_request: request });
        assert.ifError(first.error);
        assert.equal(first.data.total, "14.50");
        const replay = await authorized.rpc("post_purchase", { p_request: request });
        assert.ifError(replay.error);
        assert.deepEqual(replay.data, first.data);

        const purchase = await service
          .from("purchases")
          .select("item_id,quantity,unit_cost,total")
          .eq("id", first.data.purchase_id)
          .single();
        assert.ifError(purchase.error);
        assert.deepEqual(purchase.data, {
          item_id: itemIds[0],
          quantity: 2,
          unit_cost: 7.25,
          total: 14.5,
        });
        const lines = await service
          .from("purchase_lines")
          .select("line_number,item_id,quantity,unit_cost,subtotal,restocked")
          .eq("purchase_id", first.data.purchase_id);
        assert.ifError(lines.error);
        assert.equal(lines.data.length, 1);
        assert.deepEqual(lines.data[0], {
          line_number: 1,
          item_id: itemIds[0],
          quantity: 2,
          unit_cost: 7.25,
          subtotal: 14.5,
          restocked: true,
        });
        assert.equal((await currentStock([itemIds[0]]))[itemIds[0]], 2);
      },
    );

    await t.test(
      "multiple lines create one document, preserve snapshots, and page history summaries",
      async () => {
        const request = baseRequest({
          lines: [
            { item_id: itemIds[1], quantity: 3, unit_cost: "4.10" },
            { item_id: itemIds[2], quantity: 2, unit_cost: "8.25" },
          ],
        });
        const first = await authorized.rpc("post_purchase", { p_request: request });
        assert.ifError(first.error);
        assert.equal(first.data.total, "28.80");
        const replay = await authorized.rpc("post_purchase", { p_request: request });
        assert.ifError(replay.error);
        assert.deepEqual(replay.data, first.data);
        const changedPayload = {
          ...request,
          lines: request.lines.map((line, index) =>
            index === 0 ? { ...line, quantity: line.quantity + 1 } : line,
          ),
        };
        const conflictingReplay = await authorized.rpc("post_purchase", {
          p_request: changedPayload,
        });
        assert.ok(conflictingReplay.error);
        const purchases = await service
          .from("purchases")
          .select("id,item_id,quantity,unit_cost,total")
          .eq("invoice_no", request.invoice_no);
        assert.ifError(purchases.error);
        assert.equal(purchases.data.length, 1);
        assert.equal(purchases.data[0].item_id, null);
        assert.equal(purchases.data[0].quantity, null);
        assert.equal(purchases.data[0].unit_cost, null);
        const details = await authorized
          .from("purchase_lines")
          .select("line_number,item_id,name_snapshot,quantity,unit_cost,subtotal,restocked")
          .eq("purchase_id", first.data.purchase_id)
          .order("line_number");
        assert.ifError(details.error);
        assert.deepEqual(
          details.data.map(
            ({ line_number, item_id, quantity, unit_cost, subtotal, restocked }) => ({
              line_number,
              item_id,
              quantity,
              unit_cost,
              subtotal,
              restocked,
            }),
          ),
          [
            {
              line_number: 1,
              item_id: itemIds[1],
              quantity: 3,
              unit_cost: 4.1,
              subtotal: 12.3,
              restocked: true,
            },
            {
              line_number: 2,
              item_id: itemIds[2],
              quantity: 2,
              unit_cost: 8.25,
              subtotal: 16.5,
              restocked: true,
            },
          ],
        );
        assert.equal(details.data[0].name_snapshot, `CHG35 product ${suffix} 1`);
        const renamed = await service
          .from("inventory")
          .update({ name: `Renamed CHG35 product ${suffix}` })
          .eq("id", itemIds[1]);
        assert.ifError(renamed.error);
        const preservedSnapshot = await authorized
          .from("purchase_lines")
          .select("name_snapshot")
          .eq("purchase_id", first.data.purchase_id)
          .eq("item_id", itemIds[1])
          .single();
        assert.ifError(preservedSnapshot.error);
        assert.equal(preservedSnapshot.data.name_snapshot, `CHG35 product ${suffix} 1`);
        const history = await authorized.rpc("search_purchases_history", {
          p_search: request.invoice_no,
          p_page: 1,
        });
        assert.ifError(history.error);
        assert.equal(history.data.total_count, 1);
        assert.equal(history.data.records[0].line_count, 2);
        assert.equal(history.data.records[0].line_summary[0].name, `CHG35 product ${suffix} 1`);
        assert.deepEqual(await currentStock([itemIds[1], itemIds[2]]), {
          [itemIds[1]]: 3,
          [itemIds[2]]: 2,
        });
      },
    );

    await t.test(
      "manual lines persist exact names with internal whitespace without inventory or stock effects",
      async () => {
        const invoice = `CHG35-MANUAL-${suffix}`;
        const beforeStock = await currentStock([itemIds[10]]);
        const request = baseRequest({
          invoice_no: invoice,
          lines: [
            { item_id: null, name: "Flete\tlocal", quantity: 2, unit_cost: "3.25" },
            { item_id: null, name: "Flete local", quantity: 1, unit_cost: "7.10" },
            { item_id: null, name: "Servicio externo", quantity: 3, unit_cost: "2.00" },
          ],
        });
        const posted = await authorized.rpc("post_purchase", { p_request: request });
        assert.ifError(posted.error);
        assert.equal(posted.data.total, "19.60");
        const rows = await service
          .from("purchase_lines")
          .select("item_id,sku_snapshot,name_snapshot,quantity,unit_cost,subtotal,restocked")
          .eq("purchase_id", posted.data.purchase_id)
          .order("line_number");
        assert.ifError(rows.error);
        assert.deepEqual(
          rows.data.map((row) => [
            row.item_id,
            row.sku_snapshot,
            row.name_snapshot,
            row.subtotal,
            row.restocked,
          ]),
          [
            [null, null, "Flete\tlocal", 6.5, false],
            [null, null, "Flete local", 7.1, false],
            [null, null, "Servicio externo", 6, false],
          ],
        );
        if (process.env.CHG35_EXPECT_MANUAL_NAME_CHECK === "1") {
          const invalidNames = [
            "",
            "   ",
            "\t",
            "\n",
            "\v",
            "\f",
            "\r",
            " \t\n\v\f\r",
            " Flete",
            "Flete\t",
          ];
          for (const [index, name_snapshot] of invalidNames.entries()) {
            const line_number = 100 + index;
            const directInsert = await service.from("purchase_lines").insert({
              purchase_id: posted.data.purchase_id,
              line_number,
              item_id: null,
              sku_snapshot: null,
              name_snapshot,
              quantity: 1,
              unit_cost: 1,
              subtotal: 1,
              restocked: false,
            });
            assert.equal(directInsert.error?.code, "23514", JSON.stringify(name_snapshot));
            const absent = await service
              .from("purchase_lines")
              .select("id")
              .eq("purchase_id", posted.data.purchase_id)
              .eq("line_number", line_number);
            assert.ifError(absent.error);
            assert.deepEqual(absent.data, []);
          }
        }
        const authorizedDetails = await authorized
          .from("purchase_lines")
          .select("item_id,name_snapshot")
          .eq("purchase_id", posted.data.purchase_id)
          .order("line_number");
        assert.ifError(authorizedDetails.error);
        assert.equal(authorizedDetails.data.length, 3);
        const hiddenDetails = await unauthorized
          .from("purchase_lines")
          .select("id")
          .eq("purchase_id", posted.data.purchase_id);
        assert.ifError(hiddenDetails.error);
        assert.deepEqual(hiddenDetails.data, []);
        const inventoryMatch = await service
          .from("inventory")
          .select("id")
          .eq("name", "Flete\tlocal");
        assert.ifError(inventoryMatch.error);
        assert.deepEqual(inventoryMatch.data, []);
        assert.deepEqual(await currentStock([itemIds[10]]), beforeStock);
        const replay = await authorized.rpc("post_purchase", { p_request: request });
        assert.ifError(replay.error);
        assert.deepEqual(replay.data, posted.data);
        const history = await authorized.rpc("search_purchases_history", {
          p_search: invoice,
          p_page: 1,
        });
        assert.ifError(history.error);
        assert.deepEqual(
          history.data.records[0].line_summary.map((line) => [line.kind, line.item_id, line.name]),
          [
            ["manual", null, "Flete\tlocal"],
            ["manual", null, "Flete local"],
            ["manual", null, "Servicio externo"],
          ],
        );
        const uniquePurchase = await service
          .from("purchases")
          .select("id")
          .eq("invoice_no", invoice);
        assert.ifError(uniquePurchase.error);
        assert.equal(uniquePurchase.data.length, 1);
        const manualAnnulment = await authorized.rpc("annul_financial_document", {
          p_request: {
            idempotency_key: crypto.randomUUID(),
            document_type: "purchase",
            document_id: posted.data.purchase_id,
            reason: "CHG-35 synthetic manual-only annulment",
          },
        });
        assert.ifError(manualAnnulment.error);
        assert.deepEqual(await currentStock([itemIds[10]]), beforeStock);
      },
    );

    await t.test(
      "mixed credit purchase creates one payable and annuls linked stock atomically",
      async () => {
        const invoice = `CHG35-MIXED-${suffix}`;
        const request = baseRequest({
          invoice_no: invoice,
          payment_type: "credito",
          due_date: "2027-02-15",
          lines: [
            { item_id: itemIds[10], quantity: 4, unit_cost: "5.25" },
            { item_id: null, name: "Mano de obra", quantity: 2, unit_cost: "3.50" },
          ],
        });
        const posted = await authorized.rpc("post_purchase", { p_request: request });
        assert.ifError(posted.error);
        assert.equal(posted.data.total, "28.00");
        const lines = await service
          .from("purchase_lines")
          .select("item_id,quantity,restocked")
          .eq("purchase_id", posted.data.purchase_id)
          .order("line_number");
        assert.ifError(lines.error);
        assert.deepEqual(lines.data, [
          { item_id: itemIds[10], quantity: 4, restocked: true },
          { item_id: null, quantity: 2, restocked: false },
        ]);
        const payables = await service
          .from("supplier_credits")
          .select("id,total,balance")
          .eq("purchase_id", posted.data.purchase_id);
        assert.ifError(payables.error);
        assert.equal(payables.data.length, 1);
        assert.deepEqual(payables.data[0], {
          id: posted.data.supplier_credit_id,
          total: 28,
          balance: 28,
        });

        const short = await service.from("inventory").update({ quantity: 3 }).eq("id", itemIds[10]);
        assert.ifError(short.error);
        const voidRequest = {
          idempotency_key: crypto.randomUUID(),
          document_type: "purchase",
          document_id: posted.data.purchase_id,
          reason: "CHG-35 mixed stock rollback check",
        };
        const rejected = await authorized.rpc("annul_financial_document", {
          p_request: voidRequest,
        });
        assert.equal(rejected.error?.message, "insufficient_stock_for_annulment");
        assert.deepEqual(await currentStock([itemIds[10]]), { [itemIds[10]]: 3 });
        const stillOpen = await service
          .from("purchases")
          .select("voided_at")
          .eq("id", posted.data.purchase_id)
          .single();
        assert.ifError(stillOpen.error);
        assert.equal(stillOpen.data.voided_at, null);
        const payableStillOpen = await service
          .from("supplier_credits")
          .select("status,balance")
          .eq("purchase_id", posted.data.purchase_id)
          .single();
        assert.ifError(payableStillOpen.error);
        assert.deepEqual(payableStillOpen.data, { status: "pendiente", balance: 28 });

        const restore = await service
          .from("inventory")
          .update({ quantity: 4 })
          .eq("id", itemIds[10]);
        assert.ifError(restore.error);
        const annulled = await authorized.rpc("annul_financial_document", {
          p_request: voidRequest,
        });
        assert.ifError(annulled.error);
        assert.deepEqual(await currentStock([itemIds[10]]), { [itemIds[10]]: 0 });
        const payableAfter = await service
          .from("supplier_credits")
          .select("status,balance")
          .eq("purchase_id", posted.data.purchase_id)
          .single();
        assert.ifError(payableAfter.error);
        assert.deepEqual(payableAfter.data, { status: "anulada", balance: 0 });
      },
    );

    await t.test(
      "manual line names are server-validated before a purchase is persisted",
      async () => {
        const invalidNames = [
          "",
          "   ",
          "\t\t",
          "\n\r",
          " \t\n\v\f\r",
          " Reparación",
          "Reparación\t",
          "x".repeat(501),
        ];
        const stockBefore = await currentStock(itemIds.slice(0, 2));
        for (const [index, name] of invalidNames.entries()) {
          const invoice = `CHG35-MANUAL-INVALID-${index}-${suffix}`;
          const request = baseRequest({
            invoice_no: invoice,
            lines: [{ item_id: null, name, quantity: 1, unit_cost: "1.00" }],
          });
          const result = await authorized.rpc("post_purchase", {
            p_request: request,
          });
          assert.equal(result.error?.message, "invalid_manual_purchase_line_name");
          assert.equal(result.error?.code, "22023");
          const absent = await service.from("purchases").select("id").eq("invoice_no", invoice);
          assert.ifError(absent.error);
          assert.deepEqual(absent.data, []);
          const operation = await service
            .from("business_operations")
            .select("id")
            .eq("idempotency_key", request.idempotency_key);
          assert.ifError(operation.error);
          assert.deepEqual(operation.data, []);
        }
        assert.deepEqual(await currentStock(itemIds.slice(0, 2)), stockBefore);

        const validInvoice = `CHG35-MANUAL-VALID-BOUNDARIES-${suffix}`;
        const valid = await authorized.rpc("post_purchase", {
          p_request: baseRequest({
            invoice_no: validInvoice,
            lines: [
              { item_id: null, name: "Reparación\t interna", quantity: 1, unit_cost: "1.00" },
              { item_id: null, name: "x".repeat(500), quantity: 1, unit_cost: "1.00" },
            ],
          }),
        });
        assert.ifError(valid.error);
        const validNames = await service
          .from("purchase_lines")
          .select("name_snapshot")
          .eq("purchase_id", valid.data.purchase_id)
          .order("line_number");
        assert.ifError(validNames.error);
        assert.deepEqual(
          validNames.data.map((row) => row.name_snapshot),
          ["Reparación\t interna", "x".repeat(500)],
        );
        const validAbsent = await service
          .from("purchases")
          .select("id")
          .eq("invoice_no", validInvoice);
        assert.ifError(validAbsent.error);
        assert.equal(validAbsent.data.length, 1);
      },
    );

    await t.test("multiline credit creates exactly one payable for the server total", async () => {
      const request = baseRequest({
        payment_type: "credito",
        invoice_no: `CHG35-CREDIT-${suffix}`,
        due_date: "2027-01-31",
        lines: [
          { item_id: itemIds[3], quantity: 2, unit_cost: "11.20" },
          { item_id: itemIds[4], quantity: 1, unit_cost: "5.55" },
        ],
      });
      const posted = await authorized.rpc("post_purchase", { p_request: request });
      assert.ifError(posted.error);
      assert.equal(posted.data.total, "27.95");
      const credits = await service
        .from("supplier_credits")
        .select("id,total,balance")
        .eq("purchase_id", posted.data.purchase_id);
      assert.ifError(credits.error);
      assert.equal(credits.data.length, 1);
      assert.deepEqual(credits.data[0], {
        id: posted.data.supplier_credit_id,
        total: 27.95,
        balance: 27.95,
      });
    });

    await t.test("legacy unlinked purchase remains available and never restocks", async () => {
      const request = baseRequest({
        supplier_id: null,
        supplier_name: `Free-text supplier ${suffix}`,
        item_id: null,
        quantity: 2,
        unit_cost: "3.40",
        restock: false,
        description: `Description only ${suffix}`,
      });
      const posted = await authorized.rpc("post_purchase", { p_request: request });
      assert.ifError(posted.error);
      assert.equal(posted.data.total, "6.80");
      const header = await service
        .from("purchases")
        .select("item_id,quantity,unit_cost,total")
        .eq("id", posted.data.purchase_id)
        .single();
      assert.ifError(header.error);
      assert.deepEqual(header.data, { item_id: null, quantity: 2, unit_cost: 3.4, total: 6.8 });
      const lines = await service
        .from("purchase_lines")
        .select("id")
        .eq("purchase_id", posted.data.purchase_id);
      assert.ifError(lines.error);
      assert.equal(lines.data.length, 0);
    });

    await t.test("non-restocked lines remain unchanged through purchase annulment", async () => {
      const request = baseRequest({
        invoice_no: `CHG35-NO-RESTOCK-${suffix}`,
        restock: false,
        lines: [{ item_id: itemIds[8], quantity: 3, unit_cost: "2.25" }],
      });
      const posted = await authorized.rpc("post_purchase", { p_request: request });
      assert.ifError(posted.error);
      assert.equal((await currentStock([itemIds[8]]))[itemIds[8]], 0);
      const annulled = await authorized.rpc("annul_financial_document", {
        p_request: {
          idempotency_key: crypto.randomUUID(),
          document_type: "purchase",
          document_id: posted.data.purchase_id,
          reason: "CHG-35 synthetic non-restocked purchase",
        },
      });
      assert.ifError(annulled.error);
      assert.equal((await currentStock([itemIds[8]]))[itemIds[8]], 0);
    });

    await t.test(
      "server rejects duplicate, invalid, inactive and excessive lines without financial effects",
      async () => {
        const inactive = await service
          .from("inventory")
          .update({ is_active: false })
          .eq("id", itemIds[5]);
        assert.ifError(inactive.error);
        const cases = [
          [
            { item_id: itemIds[6], quantity: 1, unit_cost: "1.00" },
            { item_id: itemIds[6], quantity: 1, unit_cost: "1.00" },
          ],
          [{ item_id: itemIds[7], quantity: 0, unit_cost: "1.00" }],
          [{ item_id: itemIds[7], quantity: 1, unit_cost: "-1.00" }],
          [{ item_id: itemIds[7], quantity: 1, unit_cost: "1.001" }],
          [{ item_id: itemIds[5], quantity: 1, unit_cost: "1.00" }],
          [
            { item_id: itemIds[7], quantity: 1, unit_cost: "1.00" },
            { item_id: itemIds[8], quantity: 1, unit_cost: "1.00" },
            ...Array.from({ length: 99 }, () => ({
              item_id: itemIds[9],
              quantity: 1,
              unit_cost: "1.00",
            })),
          ],
          [{ item_id: crypto.randomUUID(), quantity: 1, unit_cost: "1.00" }],
          [{ item_id: itemIds[9], quantity: 100, unit_cost: "999999999999.99" }],
        ];
        for (const [index, lines] of cases.entries()) {
          const invoice = `CHG35-INVALID-${suffix}-${index}`;
          const failed = await authorized.rpc("post_purchase", {
            p_request: baseRequest({ invoice_no: invoice, lines }),
          });
          assert.ok(failed.error, `case ${index} must be rejected`);
          const rows = await service.from("purchases").select("id").eq("invoice_no", invoice);
          assert.ifError(rows.error);
          assert.equal(rows.data.length, 0);
        }
        assert.deepEqual(await currentStock([itemIds[6], itemIds[7], itemIds[8], itemIds[9]]), {
          [itemIds[6]]: 0,
          [itemIds[7]]: 0,
          [itemIds[8]]: 0,
          [itemIds[9]]: 0,
        });
      },
    );

    await t.test(
      "one hundred distinct lines are accepted and one hundred one are rejected",
      async () => {
        const lines = itemIds
          .slice(10, 110)
          .map((item_id) => ({ item_id, quantity: 1, unit_cost: "0.01" }));
        const request = baseRequest({ restock: false, lines });
        const posted = await authorized.rpc("post_purchase", { p_request: request });
        assert.ifError(posted.error);
        assert.equal(posted.data.total, "1.00");
        const detail = await service
          .from("purchase_lines")
          .select("id", { count: "exact" })
          .eq("purchase_id", posted.data.purchase_id);
        assert.ifError(detail.error);
        assert.equal(detail.count, 100);
        const rejected = await authorized.rpc("post_purchase", {
          p_request: baseRequest({
            invoice_no: `CHG35-OVER-LIMIT-${suffix}`,
            lines: [...lines, { item_id: itemIds[110], quantity: 1, unit_cost: "0.01" }],
          }),
        });
        assert.ok(rejected.error);
      },
    );

    await t.test(
      "purchase history preserves supplier search, date filters, exact count, stable pages and line summaries",
      async () => {
        const createdSupplier = await service
          .from("suppliers")
          .insert({ name: `CHG35 history supplier ${suffix}` })
          .select("id")
          .single();
        assert.ifError(createdSupplier.error);
        historySupplierId = createdSupplier.data.id;
        const prefix = `CHG35-HISTORY-${suffix}`;
        const rangeStart = new Date(Date.now() - 60_000).toISOString();
        for (let index = 0; index < 27; index += 1) {
          const posted = await authorized.rpc("post_purchase", {
            p_request: baseRequest({
              supplier_id: historySupplierId,
              supplier_name: `CHG35 history supplier ${suffix}`,
              invoice_no: `${prefix}-${String(index).padStart(2, "0")}`,
              item_id: itemIds[119],
              quantity: 1,
              unit_cost: "1.25",
              restock: false,
            }),
          });
          assert.ifError(posted.error);
        }
        const rangeEnd = new Date(Date.now() + 60_000).toISOString();
        const search = (p_search, p_page, p_from = null, p_to_exclusive = null) =>
          authorized.rpc("search_purchases_history", {
            p_search,
            p_from,
            p_to_exclusive,
            p_page,
          });

        const firstPage = await search(`CHG35 history supplier ${suffix}`, 1);
        assert.ifError(firstPage.error);
        assert.equal(firstPage.data.total_count, 27);
        assert.equal(firstPage.data.records.length, 25);
        assert.ok(firstPage.data.records.every((row) => row.line_count === 1));
        assert.ok(
          firstPage.data.records.every(
            (row) => row.line_summary[0]?.name === `CHG35 product ${suffix} 119`,
          ),
        );

        const secondPage = await search(prefix, 2);
        assert.ifError(secondPage.error);
        assert.equal(secondPage.data.total_count, 27);
        assert.equal(secondPage.data.records.length, 2);
        const firstIds = firstPage.data.records.map((row) => row.id);
        const secondIds = secondPage.data.records.map((row) => row.id);
        assert.equal(new Set([...firstIds, ...secondIds]).size, 27);
        const ordered = [...firstPage.data.records, ...secondPage.data.records];
        for (let index = 1; index < ordered.length; index += 1) {
          const previous = ordered[index - 1];
          const current = ordered[index];
          if (previous.created_at === current.created_at) assert.ok(previous.id > current.id);
          else assert.ok(previous.created_at > current.created_at);
        }

        const dateFiltered = await search(prefix, 1, rangeStart, rangeEnd);
        assert.ifError(dateFiltered.error);
        assert.equal(dateFiltered.data.total_count, 27);
        const noMatches = await search(prefix, 1, "2027-01-01T00:00:00Z", "2027-01-02T00:00:00Z");
        assert.ifError(noMatches.error);
        assert.equal(noMatches.data.total_count, 0);
        assert.deepEqual(noMatches.data.records, []);
      },
    );

    await t.test(
      "concurrent requests lock products deterministically and preserve both totals",
      async () => {
        const first = baseRequest({
          invoice_no: `CHG35-CONCURRENT-A-${suffix}`,
          lines: [
            { item_id: itemIds[111], quantity: 1, unit_cost: "2.00" },
            { item_id: itemIds[112], quantity: 1, unit_cost: "3.00" },
          ],
        });
        const second = baseRequest({
          invoice_no: `CHG35-CONCURRENT-B-${suffix}`,
          lines: [
            { item_id: itemIds[112], quantity: 2, unit_cost: "3.00" },
            { item_id: itemIds[111], quantity: 2, unit_cost: "2.00" },
          ],
        });
        const results = await Promise.all([
          authorized.rpc("post_purchase", { p_request: first }),
          authorized.rpc("post_purchase", { p_request: second }),
        ]);
        for (const result of results) assert.ifError(result.error);
        assert.deepEqual(await currentStock([itemIds[111], itemIds[112]]), {
          [itemIds[111]]: 3,
          [itemIds[112]]: 3,
        });
      },
    );

    await t.test(
      "multiline annulment is all-or-nothing, idempotent and restores every line",
      async () => {
        const purchase = await authorized.rpc("post_purchase", {
          p_request: baseRequest({
            invoice_no: `CHG35-ANNUL-${suffix}`,
            lines: [
              { item_id: itemIds[113], quantity: 3, unit_cost: "2.50" },
              { item_id: itemIds[114], quantity: 4, unit_cost: "4.00" },
            ],
          }),
        });
        assert.ifError(purchase.error);
        const initial = await currentStock([itemIds[113], itemIds[114]]);
        assert.deepEqual(initial, { [itemIds[113]]: 3, [itemIds[114]]: 4 });
        const lowerOne = await service
          .from("inventory")
          .update({ quantity: 2 })
          .eq("id", itemIds[114]);
        assert.ifError(lowerOne.error);
        const failed = await authorized.rpc("annul_financial_document", {
          p_request: {
            idempotency_key: crypto.randomUUID(),
            document_type: "purchase",
            document_id: purchase.data.purchase_id,
            reason: "CHG-35 synthetic insufficient stock",
          },
        });
        assert.equal(failed.error?.code, "23514");
        const failedCompensation = await service
          .from("financial_compensations")
          .select("operation_id")
          .eq("original_id", purchase.data.purchase_id)
          .eq("compensation_type", "annulment");
        assert.ifError(failedCompensation.error);
        assert.deepEqual(failedCompensation.data, []);
        assert.deepEqual(await currentStock([itemIds[113], itemIds[114]]), {
          [itemIds[113]]: 3,
          [itemIds[114]]: 2,
        });
        const stillOpen = await service
          .from("purchases")
          .select("voided_at")
          .eq("id", purchase.data.purchase_id)
          .single();
        assert.ifError(stillOpen.error);
        assert.equal(stillOpen.data.voided_at, null);

        const restore = await service
          .from("inventory")
          .update({ quantity: 4 })
          .eq("id", itemIds[114]);
        assert.ifError(restore.error);
        const request = {
          idempotency_key: crypto.randomUUID(),
          document_type: "purchase",
          document_id: purchase.data.purchase_id,
          reason: "CHG-35 synthetic complete stock reversal",
        };
        const reversed = await authorized.rpc("annul_financial_document", { p_request: request });
        assert.ifError(reversed.error);
        const compensation = await service
          .from("financial_compensations")
          .select("operation_id,amount,reason,original_id")
          .eq("operation_id", reversed.data.compensation_id)
          .single();
        assert.ifError(compensation.error);
        assert.deepEqual(compensation.data, {
          operation_id: reversed.data.compensation_id,
          amount: 23.5,
          reason: request.reason,
          original_id: purchase.data.purchase_id,
        });
        const audit = await service
          .from("financial_audit_events")
          .select("event_type,entity_id")
          .eq("operation_id", reversed.data.operation_id)
          .single();
        assert.ifError(audit.error);
        assert.equal(audit.data.event_type, "financial_annulment");
        assert.equal(audit.data.entity_id, purchase.data.purchase_id);
        assert.deepEqual(await currentStock([itemIds[113], itemIds[114]]), {
          [itemIds[113]]: 0,
          [itemIds[114]]: 0,
        });
        const replay = await authorized.rpc("annul_financial_document", { p_request: request });
        assert.ifError(replay.error);
        assert.deepEqual(replay.data, reversed.data);
        assert.deepEqual(await currentStock([itemIds[113], itemIds[114]]), {
          [itemIds[113]]: 0,
          [itemIds[114]]: 0,
        });
      },
    );

    await t.test(
      "a concurrent stock adjustment and multi-line annulment never leave a partial reversal",
      async () => {
        const invoice = `CHG35-RACE-ANNUL-${suffix}`;
        const posted = await authorized.rpc("post_purchase", {
          p_request: baseRequest({
            invoice_no: invoice,
            lines: [
              { item_id: itemIds[117], quantity: 3, unit_cost: "2.00" },
              { item_id: itemIds[118], quantity: 4, unit_cost: "3.00" },
            ],
          }),
        });
        assert.ifError(posted.error);
        const [adjustment, annulment] = await Promise.all([
          authorized.rpc("adjust_inventory", {
            p_request: {
              idempotency_key: crypto.randomUUID(),
              item_id: itemIds[118],
              delta: -3,
              expected_quantity: 4,
              reason: "CHG-35 concurrent synthetic stock change",
            },
          }),
          authorized.rpc("annul_financial_document", {
            p_request: {
              idempotency_key: crypto.randomUUID(),
              document_type: "purchase",
              document_id: posted.data.purchase_id,
              reason: "CHG-35 concurrent synthetic annulment",
            },
          }),
        ]);
        assert.notEqual(Boolean(adjustment.error), Boolean(annulment.error));
        const stock = await currentStock([itemIds[117], itemIds[118]]);
        const header = await service
          .from("purchases")
          .select("voided_at")
          .eq("id", posted.data.purchase_id)
          .single();
        assert.ifError(header.error);
        if (!annulment.error) {
          assert.deepEqual(stock, { [itemIds[117]]: 0, [itemIds[118]]: 0 });
          assert.ok(header.data.voided_at);
          const compensation = await service
            .from("financial_compensations")
            .select("original_id")
            .eq("operation_id", annulment.data.compensation_id)
            .single();
          assert.ifError(compensation.error);
          assert.equal(compensation.data.original_id, posted.data.purchase_id);
        } else {
          assert.equal(annulment.error.code, "23514");
          assert.deepEqual(stock, { [itemIds[117]]: 3, [itemIds[118]]: 1 });
          assert.equal(header.data.voided_at, null);
          const compensation = await service
            .from("financial_compensations")
            .select("operation_id")
            .eq("original_id", posted.data.purchase_id)
            .eq("compensation_type", "annulment");
          assert.ifError(compensation.error);
          assert.deepEqual(compensation.data, []);
        }
      },
    );

    await t.test(
      "anonymous and unauthorized users cannot post or read purchase lines",
      async () => {
        const anonymous = createClient(url, anonKey, { auth: { persistSession: false } });
        const deniedAnonymous = await anonymous.rpc("post_purchase", {
          p_request: baseRequest({
            lines: [{ item_id: itemIds[115], quantity: 1, unit_cost: "1.00" }],
          }),
        });
        assert.ok(deniedAnonymous.error);
        const deniedActor = await unauthorized.rpc("post_purchase", {
          p_request: baseRequest({
            lines: [{ item_id: itemIds[115], quantity: 1, unit_cost: "1.00" }],
          }),
        });
        assert.equal(deniedActor.error?.code, "42501");

        const allowedPurchase = await authorized.rpc("post_purchase", {
          p_request: baseRequest({
            invoice_no: `CHG35-RLS-${suffix}`,
            lines: [{ item_id: itemIds[115], quantity: 1, unit_cost: "1.00" }],
          }),
        });
        assert.ifError(allowedPurchase.error);
        const hiddenLines = await unauthorized
          .from("purchase_lines")
          .select("id")
          .eq("purchase_id", allowedPurchase.data.purchase_id);
        assert.ifError(hiddenLines.error);
        assert.deepEqual(hiddenLines.data, []);
        const deniedInsert = await authorized.from("purchase_lines").insert({
          purchase_id: allowedPurchase.data.purchase_id,
          line_number: 2,
          item_id: itemIds[116],
          sku_snapshot: "forbidden",
          name_snapshot: "forbidden",
          quantity: 1,
          unit_cost: 1,
          subtotal: 1,
        });
        assert.ok(deniedInsert.error);
        const anonymousLines = await anonymous
          .from("purchase_lines")
          .select("id")
          .eq("purchase_id", allowedPurchase.data.purchase_id);
        assert.ok(anonymousLines.error);
      },
    );
  },
);
