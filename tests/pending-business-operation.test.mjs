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

test("an uncertain walk-in sale retains its name and idempotency key", () => {
  const storage = memoryStorage();
  const operation = {
    type: "sale",
    idempotencyKey: "walk-in-stable-key",
    request: {
      client_id: null,
      walk_in_name: "Cliente ocasional de prueba",
      payment_type: "contado",
      lines: [{ item_id: "item-a", quantity: 1, expected_unit_price: "25.00" }],
    },
    context: {
      customerMode: "occasional",
      clientId: null,
      walkInName: "Cliente ocasional de prueba",
      paymentType: "contado",
    },
  };

  persistPendingBusinessOperation(storage, "actor-a", operation);
  const restored = readPendingBusinessOperation(storage, "actor-a");
  assert.deepEqual(restored, { ...operation, actorId: "actor-a" });
  assert.equal(clearPendingBusinessOperation(storage, "actor-a", "wrong-key"), false);
  assert.equal(
    readPendingBusinessOperation(storage, "actor-a").idempotencyKey,
    "walk-in-stable-key",
  );
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

test("an expense intent survives reload and cannot reuse its key for another payload", () => {
  const storage = memoryStorage();
  const intent = {
    type: "expense",
    idempotencyKey: "expense-stable-key",
    request: { concept: "Synthetic utility", amount: "12.00", date: "2026-11-01" },
  };

  persistPendingBusinessOperation(storage, "actor-expense", intent);
  assert.deepEqual(readPendingBusinessOperation(storage, "actor-expense"), {
    ...intent,
    actorId: "actor-expense",
  });
  assert.throws(
    () =>
      persistPendingBusinessOperation(storage, "actor-expense", {
        ...intent,
        request: { ...intent.request, amount: "99.00" },
      }),
    /clave de idempotencia/i,
  );
  assert.equal(readPendingBusinessOperation(storage, "another-actor"), null);
});
