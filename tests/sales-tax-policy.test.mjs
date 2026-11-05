import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTaxPolicyApprovalRequest,
  calculateSaleTax,
  PROPOSED_ITBIS_RATE,
} from "../src/lib/salesTaxPolicy.js";

test("proposed policy stays blocked until server approval", () => {
  assert.equal(
    calculateSaleTax([], { enabled: true, status: "pending", rate: PROPOSED_ITBIS_RATE }).status,
    "blocked",
  );
});

test("approved policy taxes only gravado lines and preserves snapshots", () => {
  const result = calculateSaleTax(
    [
      { itemId: "a", unitPrice: 100, quantity: 1, taxClassification: "gravado" },
      { itemId: "b", unitPrice: 50, quantity: 2, taxClassification: "exento" },
    ],
    { enabled: true, status: "approved", rate: 18, pricesInclude: false },
  );
  assert.equal(result.subtotal, 200);
  assert.equal(result.tax, 18);
  assert.equal(result.total, 218);
  assert.equal(result.lines[0].tax, 18);
  assert.equal(result.lines[1].tax, 0);
});

test("disabled approved policy preserves base amounts without claiming exemption", () => {
  const result = calculateSaleTax(
    [{ itemId: "a", unitPrice: 100, quantity: 1, taxClassification: "pendiente" }],
    { enabled: false, status: "approved", rate: PROPOSED_ITBIS_RATE, pricesInclude: false },
  );
  assert.equal(result.status, "approved");
  assert.equal(result.tax, 0);
  assert.equal(result.total, 100);
  assert.equal(result.taxStatus, "disabled");
});

test("enabled policy rejects pending product classifications", () => {
  const result = calculateSaleTax(
    [{ itemId: "a", unitPrice: 100, quantity: 1, taxClassification: "pendiente" }],
    { enabled: true, status: "approved", rate: 18, pricesInclude: false },
  );
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "tax_classification_pending");
});

test("approval request is explicit and cannot silently approve a disabled policy", () => {
  assert.deepEqual(
    buildTaxPolicyApprovalRequest({ enabled: true, rate: 18, version: "2026-11-v1" }),
    {
      enabled: true,
      rate: 18,
      prices_include: false,
      receipt_mode: "internal",
      policy_version: "2026-11-v1",
      approve: true,
    },
  );
});
