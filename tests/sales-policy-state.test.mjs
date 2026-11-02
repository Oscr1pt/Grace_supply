import test from "node:test";
import assert from "node:assert/strict";
import { deriveSalesPolicyState } from "../src/lib/salesPolicy.js";

test("an unreadable or inaccessible tax policy fails closed", () => {
  assert.equal(deriveSalesPolicyState({ data: null, error: null }), "unknown");
  assert.equal(deriveSalesPolicyState({ data: null, error: new Error("denied") }), "unknown");
});

test("sales remain blocked until approval and supported posting are both confirmed", () => {
  assert.equal(
    deriveSalesPolicyState({ data: { tax_policy_approved: false }, error: null }),
    "blocked",
  );
  assert.equal(
    deriveSalesPolicyState({ data: { tax_policy_approved: true }, error: null }),
    "unsupported",
  );
  assert.equal(
    deriveSalesPolicyState({
      data: {
        tax_policy_approved: true,
        sales_posting_supported: true,
      },
      error: null,
    }),
    "approved",
  );
  assert.equal(
    deriveSalesPolicyState({
      data: {
        tax_policy_approved: true,
        sales_posting_supported: false,
      },
      error: null,
    }),
    "unsupported",
  );
  assert.equal(
    deriveSalesPolicyState({ data: { tax_policy_approved: true }, error: null }),
    "unsupported",
  );
});
