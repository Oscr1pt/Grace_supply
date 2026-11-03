import test from "node:test";
import assert from "node:assert/strict";
import { validateInventoryAdjustment } from "../src/lib/inventoryAdjustment.js";

test("inventory adjustment validates target, delta and reason", () => {
  assert.deepEqual(
    validateInventoryAdjustment({
      currentQuantity: 4,
      targetQuantity: "7",
      reason: "Conteo físico",
    }),
    {
      ok: true,
      targetQuantity: 7,
      delta: 3,
      reason: "Conteo físico",
    },
  );
  assert.equal(
    validateInventoryAdjustment({ currentQuantity: 4, targetQuantity: "-1", reason: "x" }).ok,
    false,
  );
  assert.equal(
    validateInventoryAdjustment({ currentQuantity: 4, targetQuantity: "4", reason: "x" }).ok,
    false,
  );
  assert.equal(
    validateInventoryAdjustment({ currentQuantity: 4, targetQuantity: "5", reason: "" }).ok,
    false,
  );
  assert.equal(
    validateInventoryAdjustment({
      currentQuantity: 4,
      targetQuantity: "5",
      reason: "x".repeat(501),
    }).ok,
    false,
  );
});
