import test from "node:test";
import assert from "node:assert/strict";
import { formatReportMoney, buildReportSummary } from "../src/lib/reportPresentation.js";

test("formats decimal-string DOP amounts without rounding cents through Number", () => {
  assert.equal(formatReportMoney("123456789012.34"), "RD$ 123,456,789,012.34");
  assert.equal(formatReportMoney("0"), "RD$ 0.00");
});

test("rejects malformed monetary values instead of presenting them as zero", () => {
  assert.throws(() => formatReportMoney("not-a-number"), /amount/i);
  assert.throws(() => formatReportMoney("1.239"), /amount/i);
});

test("summary describes only measured amounts and does not infer profit", () => {
  const text = buildReportSummary({
    salesSubtotal: "85000.00",
    operatingExpenses: "18000.00",
  });
  assert.match(text, /ventas por RD\$ 85,000\.00/);
  assert.match(text, /gastos operativos por RD\$ 18,000\.00/);
  assert.match(text, /sin ITBIS/i);
  assert.doesNotMatch(text, /utilidad|ganancia|p[eé]rdida/i);
});
