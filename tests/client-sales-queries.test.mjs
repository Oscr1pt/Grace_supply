import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  CLIENT_HISTORY_SALES_FAILURE_KEY,
  CLIENT_DELETE_HISTORY_FAILURE_KEY,
  checkClientHasHistory,
  fetchClientSalesHistoryPage,
  setClientDeleteHistoryFailure,
  setClientSalesHistoryFailure,
} from "../src/lib/clientSales.js";
import { getReadFailures, setReadFailure } from "../src/lib/persistence.js";

function fakeClient(responsesByTable) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, filters: [], orders: [] };
      calls.push(call);
      const query = {
        select(columns) {
          call.columns = columns;
          return query;
        },
        eq(column, value) {
          call.filters.push([column, value]);
          return query;
        },
        in(column, values) {
          call.filters.push([column, values]);
          return query;
        },
        order(column, options) {
          call.orders.push([column, options]);
          return query;
        },
        abortSignal(signal) {
          call.signal = signal;
          return query;
        },
        range(from, to) {
          call.range = [from, to];
          const response = responsesByTable[table].shift();
          return Promise.resolve(response);
        },
        limit(count) {
          call.limit = count;
          return query;
        },
        maybeSingle() {
          return Promise.resolve(responsesByTable[table].shift());
        },
      };
      return query;
    },
  };
}

test("client sales history filters by client, pages visible sales, and loads only their lines", async () => {
  const pageRows = Array.from({ length: 26 }, (_, index) => ({
    id: `sale-${index}`,
    client_id: "client-a",
    created_at: `2026-11-${String(25 - (index % 20)).padStart(2, "0")}T12:00:00.000Z`,
  }));
  const lines = [{ sale_id: "sale-0", name: "Anillo", quantity: 1 }];
  const client = fakeClient({
    sales: [{ data: pageRows, error: null }],
    sale_lines: [{ data: lines, error: null }],
  });
  const result = await fetchClientSalesHistoryPage(client, "client-a", 2);

  assert.equal(result.sales.length, 25);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.sales[0].lines, lines);
  assert.equal(client.calls[0].table, "sales");
  assert.equal(
    client.calls[0].columns,
    "id,receipt_no,client_id,client_name_snapshot,total,payment_type,created_at,voided_at",
  );
  assert.deepEqual(client.calls[0].filters, [["client_id", "client-a"]]);
  assert.deepEqual(client.calls[0].range, [50, 75]);
  assert.deepEqual(client.calls[1].filters, [
    ["sale_id", pageRows.slice(0, 25).map((row) => row.id)],
  ]);
  assert.equal(client.calls[1].range[0], 0);
  assert.equal(client.calls[1].columns, "sale_id,name,quantity");
  assert.ok(!client.calls.some((call) => call.table === "sales" && call.filters.length === 0));
});

test("client history lines are paginated for only the currently visible sales", async () => {
  const sale = { id: "sale-current", client_id: "client-a" };
  const firstLinePage = Array.from({ length: 500 }, (_, index) => ({
    sale_id: sale.id,
    name: `Item ${index}`,
    quantity: 1,
  }));
  const secondLinePage = [{ sale_id: sale.id, name: "Item 500", quantity: 1 }];
  const client = fakeClient({
    sales: [{ data: [sale], error: null }],
    sale_lines: [
      { data: firstLinePage, error: null },
      { data: secondLinePage, error: null },
    ],
  });

  const result = await fetchClientSalesHistoryPage(client, "client-a", 0);
  assert.equal(result.sales[0].lines.length, 501);
  assert.deepEqual(
    client.calls.filter((call) => call.table === "sale_lines").map((call) => call.range),
    [
      [0, 499],
      [500, 999],
    ],
  );
});

test("an empty client history is successful and avoids a sale-lines read", async () => {
  const client = fakeClient({ sales: [{ data: [], error: null }], sale_lines: [] });
  const result = await fetchClientSalesHistoryPage(client, "client-a", 0);
  assert.deepEqual(result, { sales: [], hasMore: false });
  assert.equal(client.calls.length, 1);
});

test("client deletion history check independently verifies sales and credits and fails closed", async () => {
  const client = fakeClient({
    sales: [{ data: null, error: null }],
    client_credits: [{ data: { id: "credit-a" }, error: null }],
  });
  assert.equal(await checkClientHasHistory(client, "client-a"), true);
  assert.ok(client.calls.every((call) => call.columns === "id" && call.limit === 1));
  assert.ok(
    client.calls.every(
      (call) => call.filters[0][0] === "client_id" && call.filters[0][1] === "client-a",
    ),
  );

  const denied = fakeClient({
    sales: [{ data: null, error: { code: "42501" } }],
    client_credits: [{ data: null, error: null }],
  });
  await assert.rejects(
    checkClientHasHistory(denied, "client-a"),
    (error) => error.code === "42501",
  );

  const noHistory = fakeClient({
    sales: [{ data: null, error: null }],
    client_credits: [{ data: null, error: null }],
  });
  assert.equal(await checkClientHasHistory(noHistory, "client-a"), false);

  const uncertain = fakeClient({
    sales: [{ data: undefined, error: null }],
    client_credits: [{ data: null, error: null }],
  });
  await assert.rejects(
    checkClientHasHistory(uncertain, "client-a"),
    /no se pudo confirmar el historial/i,
  );

  assert.equal(CLIENT_HISTORY_SALES_FAILURE_KEY, "Historial de ventas de clientes");
  assert.equal(CLIENT_DELETE_HISTORY_FAILURE_KEY, "Verificación del historial del cliente");
});

test("client history failures clear only their own global warning keys", () => {
  setReadFailure("sales", "Fallo real del módulo Ventas");
  setClientSalesHistoryFailure("Fallo al cargar historial");
  setClientDeleteHistoryFailure("Fallo al comprobar borrado");

  setClientSalesHistoryFailure(null);
  const failures = new Map(getReadFailures().map(({ table, message }) => [table, message]));
  assert.equal(failures.has(CLIENT_HISTORY_SALES_FAILURE_KEY), false);
  assert.equal(failures.get(CLIENT_DELETE_HISTORY_FAILURE_KEY), "Fallo al comprobar borrado");
  assert.equal(failures.get("sales"), "Fallo real del módulo Ventas");

  setClientDeleteHistoryFailure(null);
  setReadFailure("sales", null);
});

test("Clients route no longer mounts a global sales table read", () => {
  const source = readFileSync(new URL("../src/routes/_app/clients.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /useSupabaseTable\s*<\s*Sale\s*>\s*\(\s*["']sales["']/);
  assert.doesNotMatch(source, /const\s+salesTable\s*=\s*useSupabaseTable/);
  assert.match(source, /useClientSalesHistory\(/);
});
