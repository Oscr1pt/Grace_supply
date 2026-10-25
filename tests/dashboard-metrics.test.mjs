import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateDashboardMetrics,
  getDashboardPeriod,
  getDashboardReadState,
} from "../src/lib/dashboardMetrics.js";

test("dashboard uses Dominican calendar boundaries for daily and monthly sales", () => {
  const period = getDashboardPeriod(new Date("2026-11-01T03:30:00.000Z"));

  assert.deepEqual(period, { today: "2026-10-31", month: "2026-10" });
  assert.deepEqual(getDashboardPeriod(new Date("2026-11-01T04:30:00.000Z")), {
    today: "2026-11-01",
    month: "2026-11",
  });
});

test("metrics separate booked sales from cash sales and exclude voided rows", () => {
  const metrics = calculateDashboardMetrics(
    {
      sales: [
        { total: 120, paymentType: "contado", createdAt: "2026-11-01T03:00:00.000Z" },
        { total: 200, paymentType: "credito", createdAt: "2026-11-01T05:00:00.000Z" },
        { total: 300, paymentType: "contado", createdAt: "2026-11-15T15:00:00.000Z" },
        { total: 70, createdAt: "2026-11-10T15:00:00.000Z" },
        {
          total: 500,
          paymentType: "contado",
          createdAt: "2026-11-20T15:00:00.000Z",
          voidedAt: "2026-11-20T16:00:00.000Z",
        },
      ],
      expenses: [],
      inventory: [],
      clients: [],
    },
    new Date("2026-11-01T04:30:00.000Z"),
  );

  assert.equal(metrics.salesTodayCount, 1);
  assert.equal(metrics.monthSalesAmount, 570);
  assert.equal(metrics.monthCashSalesAmount, 300);
  assert.equal(metrics.monthCreditSalesCount, 1);
  assert.equal(metrics.monthUnclassifiedSalesCount, 1);
});

test("monthly expenses exclude annulled entries and compare calendar dates", () => {
  const metrics = calculateDashboardMetrics(
    {
      sales: [],
      expenses: [
        { amount: 40, date: "2026-11-01", status: "registrado" },
        { amount: 60, date: "2026-11-02", status: "anulado" },
        { amount: 20, date: "2026-10-31", status: "registrado" },
      ],
      inventory: [],
      clients: [],
    },
    new Date("2026-11-01T04:30:00.000Z"),
  );

  assert.equal(metrics.monthExpenseCount, 1);
  assert.equal(metrics.monthExpenseAmount, 40);
});

test("inventory uses active sale prices only and clients follow their actual status", () => {
  const metrics = calculateDashboardMetrics(
    {
      sales: [],
      expenses: [],
      inventory: [
        { price: 20, costPrice: 900, quantity: 3, isActive: true },
        { price: 50, costPrice: 800, quantity: 2, isActive: false },
      ],
      clients: [
        { status: "activo" },
        { status: "activo" },
        { status: "inactivo" },
        { status: undefined },
      ],
    },
    new Date("2026-11-01T04:30:00.000Z"),
  );

  assert.equal(metrics.activeInventoryCount, 1);
  assert.equal(metrics.inactiveInventoryCount, 1);
  assert.equal(metrics.estimatedInventorySaleValue, 60);
  assert.equal(metrics.activeClientCount, 2);
  assert.equal(metrics.inactiveClientCount, 1);
  assert.equal(metrics.unknownClientStatusCount, 1);
});

test("empty successful reads are distinct from loading, denied, failed, and stale data", () => {
  assert.equal(getDashboardReadState({ data: [], loading: true, stale: true }), "loading");
  assert.equal(getDashboardReadState({ data: [], loading: false, stale: false }), "empty");
  assert.equal(
    getDashboardReadState({
      data: [],
      loading: false,
      stale: true,
      loadError: "falló",
      loadErrorKind: "service",
    }),
    "error",
  );
  assert.equal(
    getDashboardReadState({
      data: [],
      loading: false,
      stale: true,
      loadError: "denegado",
      loadErrorKind: "denied",
    }),
    "denied",
  );
  assert.equal(
    getDashboardReadState({ data: [{ id: "1" }], loading: false, stale: true, loadError: "falló" }),
    "stale",
  );
  assert.equal(
    getDashboardReadState({ data: [{ id: "1" }], loading: false, stale: false }),
    "ready",
  );
  assert.equal(getDashboardReadState({ data: [], loading: false, stale: false }, false), "denied");
});

test("a dashboard with no records produces actual zero aggregates", () => {
  const metrics = calculateDashboardMetrics(
    { sales: [], expenses: [], inventory: [], clients: [] },
    new Date("2026-11-01T04:30:00.000Z"),
  );

  assert.equal(metrics.monthSalesAmount, 0);
  assert.equal(metrics.monthCashSalesAmount, 0);
  assert.equal(metrics.monthExpenseAmount, 0);
  assert.equal(metrics.estimatedInventorySaleValue, 0);
  assert.equal(metrics.activeClientCount, 0);
});
