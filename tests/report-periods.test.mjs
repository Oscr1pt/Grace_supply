import test from "node:test";
import assert from "node:assert/strict";
import { resolveReportPeriod } from "../src/lib/reportPeriods.js";

test("weekly period starts Monday and ends before next Monday in Santo Domingo", () => {
  assert.deepEqual(resolveReportPeriod("week", "2026-01-01"), {
    startDate: "2025-12-29",
    endDateExclusive: "2026-01-05",
    bucketCount: 7,
  });
});

test("monthly period uses calendar boundaries including leap February", () => {
  assert.deepEqual(resolveReportPeriod("month", "2024-02-29"), {
    startDate: "2024-02-01",
    endDateExclusive: "2024-03-01",
    bucketCount: 5,
  });
});

test("annual period uses January through the next January", () => {
  assert.deepEqual(resolveReportPeriod("year", "2026-07-20"), {
    startDate: "2026-01-01",
    endDateExclusive: "2027-01-01",
    bucketCount: 12,
  });
});

test("rejects unsupported period types and invalid calendar dates", () => {
  assert.throws(() => resolveReportPeriod("quarter", "2026-01-01"), /period/i);
  assert.throws(() => resolveReportPeriod("month", "2026-02-30"), /date/i);
});
