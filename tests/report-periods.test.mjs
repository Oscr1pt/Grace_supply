import test from "node:test";
import assert from "node:assert/strict";
import {
  getCurrentBusinessYear,
  resolveReportPeriod,
  validateReportPeriodSelection,
} from "../src/lib/reportPeriods.js";

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

test("keeps partial years invalid until four digits are entered", () => {
  for (const value of ["", "2", "20", "202", "20260"]) {
    assert.equal(validateReportPeriodSelection("year", value, 2026).valid, false, value);
  }
  assert.deepEqual(validateReportPeriodSelection("year", "2026", 2026), {
    valid: true,
    anchorDate: "2026-01-01",
    selectorValue: "2026",
    error: null,
  });
});

test("limits selectable years to 2000 through the supplied Santo Domingo business year", () => {
  assert.equal(validateReportPeriodSelection("year", "1999", 2026).valid, false);
  assert.equal(validateReportPeriodSelection("year", "2027", 2026).valid, false);
  assert.equal(validateReportPeriodSelection("year", "2000", 2026).valid, true);
});

test("rejects incomplete or impossible weekly dates and months without throwing", () => {
  for (const [type, value] of [
    ["week", ""],
    ["week", "2026-02-30"],
    ["month", ""],
    ["month", "2026-"],
    ["month", "2026-13"],
  ]) {
    assert.equal(validateReportPeriodSelection(type, value, 2026).valid, false, `${type}:${value}`);
  }
  assert.equal(validateReportPeriodSelection("month", "2026-02", 2026).valid, true);
  assert.equal(validateReportPeriodSelection("week", "2026-02-28", 2026).valid, true);
});

test("current selectable year follows America/Santo_Domingo rather than the host zone", () => {
  assert.equal(getCurrentBusinessYear(new Date("2027-01-01T03:30:00.000Z")), 2026);
  assert.equal(getCurrentBusinessYear(new Date("2027-01-01T04:30:00.000Z")), 2027);
});
