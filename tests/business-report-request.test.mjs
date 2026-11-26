import test from "node:test";
import assert from "node:assert/strict";
import { invokeBusinessReportRpc } from "../src/lib/businessReportRequest.js";

test("does not invoke the reports RPC for empty or partial year input", async () => {
  let calls = 0;
  const rpc = async () => {
    calls += 1;
    return { data: null, error: null };
  };

  for (const value of ["", "2", "20", "202"]) {
    await assert.rejects(
      invokeBusinessReportRpc(rpc, "year", value, 2026),
      (error) => error.code === "INVALID_REPORT_PERIOD",
    );
  }
  assert.equal(calls, 0);
});

test("does not invoke the reports RPC for years outside the visible selector range", async () => {
  let calls = 0;
  const rpc = async () => {
    calls += 1;
    return { data: null, error: null };
  };

  await assert.rejects(invokeBusinessReportRpc(rpc, "year", "1999", 2026), /2000/);
  await assert.rejects(invokeBusinessReportRpc(rpc, "year", "2027", 2026), /2026/);
  assert.equal(calls, 0);
});

test("valid year selection requests exactly the validated business year", async () => {
  const calls = [];
  const rpc = async (...args) => {
    calls.push(args);
    return { data: null, error: null };
  };

  const result = await invokeBusinessReportRpc(rpc, "year", "2026", 2026);
  assert.deepEqual(calls, [
    ["get_business_report", { p_period_type: "year", p_anchor_date: "2026-01-01" }],
  ]);
  assert.deepEqual(result.expectedPeriod, {
    type: "year",
    anchorDate: "2026",
    startDate: "2026-01-01",
    endDateExclusive: "2027-01-01",
  });
});

test("does not invoke the reports RPC for empty weekly or incomplete monthly values", async () => {
  let calls = 0;
  const rpc = async () => {
    calls += 1;
    return { data: null, error: null };
  };

  await assert.rejects(invokeBusinessReportRpc(rpc, "week", "", 2026), /fecha válida/i);
  await assert.rejects(invokeBusinessReportRpc(rpc, "month", "2026-", 2026), /mes y un año/i);
  await assert.rejects(invokeBusinessReportRpc(rpc, "month", "2026-13", 2026), /mes y un año/i);
  assert.equal(calls, 0);
});
