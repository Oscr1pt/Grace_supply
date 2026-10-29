import test from "node:test";
import assert from "node:assert/strict";
import {
  clearPendingCreditPayment,
  formatMoneyFromCents,
  localDateInDominicanRepublic,
  matchesLegacySupplierName,
  parseMoneyToCents,
  persistPendingCreditPayment,
  readPendingCreditPayment,
  summarizeCredits,
  validatePartyForm,
} from "../src/lib/creditWorkflows.js";

class MemoryStorage {
  values = new Map();
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.values.set(key, value);
  }
  removeItem(key) {
    this.values.delete(key);
  }
}

test("money inputs accept positive precision up to cents without rounding", () => {
  assert.equal(parseMoneyToCents("0.01"), 1);
  assert.equal(parseMoneyToCents("1200"), 120000);
  assert.equal(parseMoneyToCents("12.5"), 1250);
  assert.equal(parseMoneyToCents("0001.50"), 150);
  assert.equal(parseMoneyToCents("12.345"), null);
  assert.equal(parseMoneyToCents("-1"), null);
  assert.equal(parseMoneyToCents("1e2"), null);
  assert.equal(parseMoneyToCents(""), null);
  assert.equal(formatMoneyFromCents(1250), "12.50");
  assert.equal(formatMoneyFromCents(0), "0.00");
});

test("pending payment survives navigation and can only be cleared by its own key", () => {
  const storage = new MemoryStorage();
  const operation = {
    actorId: "actor-a",
    operation: "client_payment",
    creditType: "client",
    creditId: "credit-a",
    idempotencyKey: "key-a",
    request: {
      idempotency_key: "key-a",
      credit_type: "client",
      credit_id: "credit-a",
      amount: "10.00",
    },
  };

  persistPendingCreditPayment(storage, operation);
  assert.deepEqual(readPendingCreditPayment(storage), operation);
  assert.equal(clearPendingCreditPayment(storage, "different-key"), false);
  assert.deepEqual(readPendingCreditPayment(storage), operation);
  assert.equal(clearPendingCreditPayment(storage, "key-a"), true);
  assert.equal(readPendingCreditPayment(storage), null);
});

test("pending idempotency key cannot be overwritten with another debt or payload", () => {
  const storage = new MemoryStorage();
  const operation = {
    actorId: "actor-a",
    operation: "supplier_payment",
    creditType: "supplier",
    creditId: "credit-a",
    idempotencyKey: "key-a",
    request: {
      idempotency_key: "key-a",
      credit_type: "supplier",
      credit_id: "credit-a",
      amount: "10.00",
    },
  };
  persistPendingCreditPayment(storage, operation);
  assert.throws(
    () => persistPendingCreditPayment(storage, { ...operation, creditId: "credit-b" }),
    /pendiente/i,
  );
  assert.throws(
    () =>
      persistPendingCreditPayment(storage, {
        ...operation,
        request: { ...operation.request, amount: "11.00" },
      }),
    /pendiente/i,
  );
  assert.deepEqual(readPendingCreditPayment(storage), operation);
});

test("malformed pending state fails closed instead of permitting a replacement payment", () => {
  const storage = new MemoryStorage();
  storage.setItem("grace-supply.pending-credit-payment.v1", "not-json");
  assert.throws(() => readPendingCreditPayment(storage), /pago pendiente/i);
});

test("payment date uses the Dominican Republic calendar date", () => {
  const shortlyAfterUtcMidnight = new Date("2026-10-27T02:30:00.000Z");
  assert.equal(localDateInDominicanRepublic(shortlyAfterUtcMidnight), "2026-10-26");
});

test("legacy supplier-name matching is used only when no ID exists and the name is unique", () => {
  const suppliers = [
    { id: "supplier-a", name: "Casa Norte" },
    { id: "supplier-b", name: "Casa Norte" },
  ];
  assert.equal(matchesLegacySupplierName(null, "casa norte", suppliers[0], suppliers), false);
  assert.equal(
    matchesLegacySupplierName("supplier-b", "Casa Norte", suppliers[0], [
      { id: "supplier-a", name: "Casa Norte" },
    ]),
    false,
  );
  assert.equal(
    matchesLegacySupplierName(null, " Casa   Norte ", suppliers[0], [
      { id: "supplier-a", name: "Casa Norte" },
    ]),
    true,
  );
});

test("credit summaries exclude annulled documents from original, paid and pending totals", () => {
  assert.deepEqual(
    summarizeCredits([
      { total: 100, paid: 20, balance: 80, status: "parcial" },
      { total: 50, paid: 10, balance: 40, status: "anulada" },
    ]),
    { original: 100, paid: 20, balance: 80 },
  );
});

test("party validation requires a name and validates only an optional supplied email", () => {
  assert.deepEqual(validatePartyForm({ name: "  ", email: "", rnc: "" }), {
    name: "Escribe un nombre o razón social.",
  });
  assert.deepEqual(
    validatePartyForm({ name: "Cliente", email: "bad", rnc: "fiscal text as entered" }),
    { email: "Escribe un correo válido o deja este campo vacío." },
  );
  assert.deepEqual(
    validatePartyForm({
      name: "Proveedor",
      email: "contacto@example.do",
      rnc: "cualquier identificador",
    }),
    {},
  );
});
