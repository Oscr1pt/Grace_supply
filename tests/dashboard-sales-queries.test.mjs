import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateDashboardSalesMetrics,
  fetchDashboardMonthlySales,
  fetchRecentDashboardSales,
  getDashboardSalesRange,
  DASHBOARD_MONTH_SALES_FAILURE_KEY,
  DASHBOARD_RECENT_SALES_FAILURE_KEY,
} from "../src/lib/dashboardSales.js";
import { getReadFailures, setReadFailure } from "../src/lib/persistence.js";

function createClient(responses) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table };
      calls.push(call);
      const query = {
        select(columns) {
          call.columns = columns;
          return query;
        },
        is(column, value) {
          (call.filters ??= []).push(["is", column, value]);
          return query;
        },
        gte(column, value) {
          (call.filters ??= []).push(["gte", column, value]);
          return query;
        },
        lt(column, value) {
          (call.filters ??= []).push(["lt", column, value]);
          return query;
        },
        order(column, options) {
          (call.orders ??= []).push([column, options]);
          return query;
        },
        abortSignal(signal) {
          call.signal = signal;
          return query;
        },
        range(from, to) {
          call.range = [from, to];
          return Promise.resolve({ data: responses.shift(), error: null });
        },
        limit(count) {
          call.limit = count;
          return query;
        },
      };
      query.then = (...args) =>
        Promise.resolve({ data: responses.shift(), error: null }).then(...args);
      return query;
    },
  };
}

test("dashboard monthly bounds use Dominican local midnights, including month and year edges", () => {
  assert.deepEqual(getDashboardSalesRange(new Date("2026-11-01T03:30:00.000Z")), {
    start: "2026-10-01T04:00:00.000Z",
    endExclusive: "2026-11-01T04:00:00.000Z",
  });
  assert.deepEqual(getDashboardSalesRange(new Date("2027-01-01T04:30:00.000Z")), {
    start: "2027-01-01T04:00:00.000Z",
    endExclusive: "2027-02-01T04:00:00.000Z",
  });
});

test("monthly query filters active sales and pages beyond 1,000 rows without sale lines", async () => {
  const pages = [
    Array.from({ length: 500 }, (_, id) => ({ id })),
    Array.from({ length: 500 }, (_, id) => ({ id: id + 500 })),
    Array.from({ length: 201 }, (_, id) => ({ id: id + 1000 })),
  ];
  const client = createClient(pages);
  const rows = await fetchDashboardMonthlySales(client, {
    start: "2026-11-01T04:00:00.000Z",
    endExclusive: "2026-12-01T04:00:00.000Z",
  });

  assert.equal(rows.length, 1201);
  assert.equal(client.calls.length, 3);
  assert.ok(
    client.calls.every(
      ({ table, columns, filters }) =>
        table === "sales" &&
        columns === "id,total,payment_type,created_at" &&
        !columns.includes("lines"),
    ),
  );
  assert.deepEqual(
    client.calls.map((call) => call.range),
    [
      [0, 499],
      [500, 999],
      [1000, 1499],
    ],
  );
  assert.ok(
    client.calls.every(({ filters }) =>
      filters.some(
        ([kind, column, value]) => kind === "is" && column === "voided_at" && value === null,
      ),
    ),
  );
  assert.ok(
    client.calls.every(({ filters }) =>
      filters.some(([kind, column]) => kind === "gte" && column === "created_at"),
    ),
  );
  assert.ok(
    client.calls.every(({ filters }) =>
      filters.some(([kind, column]) => kind === "lt" && column === "created_at"),
    ),
  );
});

test("monthly metric calculation uses exact cents and keeps cash count separate", () => {
  const sales = [
    { total: "122913.00", paymentType: "credito", createdAt: "2026-11-10T15:00:00.000Z" },
    { total: "50000.10", paymentType: "contado", createdAt: "2026-11-11T15:00:00.000Z" },
    { total: "44718.90", paymentType: "contado", createdAt: "2026-11-12T15:00:00.000Z" },
    {
      total: "99.00",
      paymentType: "contado",
      createdAt: "2026-11-12T15:00:00.000Z",
      voidedAt: "2026-11-12T16:00:00.000Z",
    },
  ];
  assert.deepEqual(calculateDashboardSalesMetrics(sales, new Date("2026-11-20T15:00:00.000Z")), {
    monthSalesAmount: 217632,
    monthSalesCount: 3,
    monthCashSalesAmount: 94719,
    monthCashSalesCount: 2,
    monthCreditSalesCount: 1,
    monthUnclassifiedSalesCount: 0,
    salesTodayCount: 0,
  });
});

test("dashboard sums more than 1,000 historical records as the current-month QA reference", () => {
  const sales = [
    ...Array.from({ length: 82 }, (_, index) => ({
      total: "1000.00",
      paymentType: "contado",
      createdAt: `2026-11-${String((index % 28) + 1).padStart(2, "0")}T15:00:00.000Z`,
    })),
    { total: "12718.00", paymentType: "contado", createdAt: "2026-11-20T15:00:00.000Z" },
    ...Array.from({ length: 15 }, (_, index) => ({
      total: "1000.00",
      paymentType: "credito",
      createdAt: `2026-11-${String((index % 28) + 1).padStart(2, "0")}T15:00:00.000Z`,
    })),
    { total: "13195.00", paymentType: "credito", createdAt: "2026-11-21T15:00:00.000Z" },
  ];

  assert.equal(sales.length, 99);
  assert.deepEqual(calculateDashboardSalesMetrics(sales, new Date("2026-11-30T15:00:00.000Z")), {
    monthSalesAmount: 122913,
    monthSalesCount: 99,
    monthCashSalesAmount: 94718,
    monthCashSalesCount: 83,
    monthCreditSalesCount: 16,
    monthUnclassifiedSalesCount: 0,
    salesTodayCount: 0,
  });
});

test("recent sales query reads only five compact non-annulled sales and never joins lines", async () => {
  const client = createClient([[{ id: "1" }]]);
  const rows = await fetchRecentDashboardSales(client);
  assert.deepEqual(rows, [{ id: "1" }]);
  assert.equal(client.calls[0].table, "sales");
  assert.equal(
    client.calls[0].columns,
    "id,receipt_no,client_id,client_name_snapshot,total,payment_type,created_at",
  );
  assert.equal(client.calls[0].limit, 5);
  assert.deepEqual(client.calls[0].orders, [
    ["created_at", { ascending: false }],
    ["id", { ascending: false }],
  ]);
  assert.ok(
    client.calls[0].filters.some(
      ([kind, column, value]) => kind === "is" && column === "voided_at" && value === null,
    ),
  );
  assert.ok(!client.calls[0].columns.includes("sale_lines"));
});

test("dashboard query success keys are independent from each other and other modules", () => {
  setReadFailure("sales", "fallo legítimo del módulo Ventas");
  setReadFailure(DASHBOARD_MONTH_SALES_FAILURE_KEY, "fallo mensual");
  setReadFailure(DASHBOARD_RECENT_SALES_FAILURE_KEY, "fallo recientes");

  setReadFailure(DASHBOARD_MONTH_SALES_FAILURE_KEY, null);
  const failures = new Map(getReadFailures().map(({ table, message }) => [table, message]));
  assert.equal(failures.has(DASHBOARD_MONTH_SALES_FAILURE_KEY), false);
  assert.equal(failures.get(DASHBOARD_RECENT_SALES_FAILURE_KEY), "fallo recientes");
  assert.equal(failures.get("sales"), "fallo legítimo del módulo Ventas");

  setReadFailure(DASHBOARD_RECENT_SALES_FAILURE_KEY, null);
  setReadFailure("sales", null);
});
