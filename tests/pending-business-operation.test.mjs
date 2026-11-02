import test from "node:test";
import assert from "node:assert/strict";

const {
  persistPendingBusinessOperation,
  readPendingBusinessOperation,
  clearPendingBusinessOperation,
} = await import("../src/lib/pendingBusinessOperation.js");

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("a pending financial operation is retained for the same actor and cannot be replaced", () => {
  const storage = memoryStorage();
  const operation = {
    type: "purchase",
    idempotencyKey: "stable-key",
    request: { supplier_id: "supplier-a", quantity: 2 },
  };

  persistPendingBusinessOperation(storage, "actor-a", operation);
  assert.deepEqual(readPendingBusinessOperation(storage, "actor-a"), {
    ...operation,
    actorId: "actor-a",
  });
  assert.throws(
    () =>
      persistPendingBusinessOperation(storage, "actor-a", {
        ...operation,
        idempotencyKey: "other-key",
      }),
    /pendiente/i,
  );
  assert.equal(readPendingBusinessOperation(storage, "actor-b"), null);
});

test("only the matching confirmed operation can clear the retained intent", () => {
  const storage = memoryStorage();
  persistPendingBusinessOperation(storage, "actor-a", {
    type: "sale",
    idempotencyKey: "same-key",
    request: { client_id: "client-a", lines: [{ item_id: "item-a", quantity: 1 }] },
  });

  assert.equal(clearPendingBusinessOperation(storage, "actor-a", "different-key"), false);
  assert.ok(readPendingBusinessOperation(storage, "actor-a"));
  assert.equal(clearPendingBusinessOperation(storage, "actor-a", "same-key"), true);
  assert.equal(readPendingBusinessOperation(storage, "actor-a"), null);
});
