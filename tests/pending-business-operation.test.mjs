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

test("an uncertain multi-line purchase restores every line and reuses its original request key", () => {
  const firstSession = memoryStorage();
  const operation = {
    type: "purchase",
    idempotencyKey: "purchase-multiline-stable-key",
    request: {
      supplier_id: "supplier-a",
      invoice_no: "CHG35-UNCERTAIN-1",
      restock: true,
      lines: [
        { item_id: "item-a", quantity: 2, unit_cost: "3.25" },
        { item_id: null, name: "Servicio externo", quantity: 4, unit_cost: "7.50" },
      ],
    },
    context: {
      linkedLinesMode: true,
      lines: [
        {
          key: "line-a",
          kind: "linked",
          itemId: "item-a",
          manualName: "",
          quantity: 2,
          unitCost: 3.25,
        },
        {
          key: "line-b",
          kind: "manual",
          itemId: "",
          manualName: "Servicio externo",
          quantity: 4,
          unitCost: 7.5,
        },
      ],
      restock: true,
    },
  };

  persistPendingBusinessOperation(firstSession, "actor-purchase", operation);
  const persistedValue = firstSession.getItem("grace.pending-business-operation.v1:actor-purchase");
  const restoredSession = memoryStorage();
  restoredSession.setItem("grace.pending-business-operation.v1:actor-purchase", persistedValue);

  const restored = readPendingBusinessOperation(restoredSession, "actor-purchase");
  assert.equal(restored.idempotencyKey, operation.idempotencyKey);
  assert.deepEqual(restored.request.lines, operation.request.lines);
  assert.deepEqual(restored.context.lines, operation.context.lines);
  assert.equal(
    clearPendingBusinessOperation(restoredSession, "actor-purchase", "different-key"),
    false,
  );
  assert.throws(
    () =>
      persistPendingBusinessOperation(restoredSession, "actor-purchase", {
        ...restored,
        request: {
          ...restored.request,
          lines: restored.request.lines.map((line) => ({ ...line, quantity: line.quantity + 1 })),
        },
      }),
    /clave de idempotencia/i,
  );
  assert.deepEqual(
    readPendingBusinessOperation(restoredSession, "actor-purchase").request.lines,
    operation.request.lines,
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
