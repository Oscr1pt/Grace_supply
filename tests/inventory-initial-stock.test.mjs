import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialInventoryRequest,
  validateInitialInventory,
} from "../src/lib/initialInventory.js";

test("initial inventory accepts zero and positive integers only", () => {
  assert.deepEqual(validateInitialInventory("0"), { ok: true, quantity: 0 });
  assert.deepEqual(validateInitialInventory("12"), { ok: true, quantity: 12 });
  for (const value of ["", "1.5", "-1", "abc", "1e3"]) {
    assert.equal(validateInitialInventory(value).ok, false, value);
  }
});

test("initial inventory request is stable and uses zero expectation", () => {
  const request = createInitialInventoryRequest("product-1", 7, "actor-1", "key-1");
  assert.deepEqual(request, {
    operation_id: "key-1",
    idempotency_key: "key-1",
    item_id: "product-1",
    expected_quantity: 0,
    delta: 7,
    reason: "Existencia inicial al registrar producto",
  });
});
