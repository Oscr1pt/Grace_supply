import assert from "node:assert/strict";
import test from "node:test";
import { resolveHistoryDateRange } from "../src/lib/historyDateRange.js";

test("today uses Santo Domingo local midnight boundaries", () => {
  assert.deepEqual(resolveHistoryDateRange({ period: "today", now: "2026-11-14T12:00:00.000Z" }), {
    fromInclusive: "2026-11-14T04:00:00.000Z",
    toExclusive: "2026-11-15T04:00:00.000Z",
  });
});

test("last seven days includes today and the prior six local dates", () => {
  assert.deepEqual(
    resolveHistoryDateRange({ period: "last7Days", now: "2026-11-14T12:00:00.000Z" }),
    {
      fromInclusive: "2026-11-08T04:00:00.000Z",
      toExclusive: "2026-11-15T04:00:00.000Z",
    },
  );
});

test("this month uses local month boundaries across a year change", () => {
  assert.deepEqual(
    resolveHistoryDateRange({ period: "thisMonth", now: "2026-12-31T12:00:00.000Z" }),
    {
      fromInclusive: "2026-12-01T04:00:00.000Z",
      toExclusive: "2027-01-01T04:00:00.000Z",
    },
  );
});

test("custom end date includes the whole date through an exclusive next midnight", () => {
  assert.deepEqual(
    resolveHistoryDateRange({ period: "custom", from: "2026-11-12", to: "2026-11-14" }),
    {
      fromInclusive: "2026-11-12T04:00:00.000Z",
      toExclusive: "2026-11-15T04:00:00.000Z",
    },
  );
});

test("custom ranges reject partial, malformed, and reversed dates", () => {
  for (const input of [
    { period: "custom", from: "2026-11-12", to: "" },
    { period: "custom", from: "2026-02-30", to: "2026-03-01" },
    { period: "custom", from: "2026-11-14", to: "2026-11-12" },
  ]) {
    assert.throws(() => resolveHistoryDateRange(input), { name: "HistoryDateRangeError" });
  }
});

test("all period has no date bounds", () => {
  assert.deepEqual(resolveHistoryDateRange({ period: "all" }), {
    fromInclusive: null,
    toExclusive: null,
  });
});
