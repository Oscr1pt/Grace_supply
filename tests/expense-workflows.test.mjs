import assert from "node:assert/strict";
import test from "node:test";
import {
  filterExpenses,
  localExpenseDate,
  normalizeExpenseAmount,
  summarizeExpenses,
  validateExpenseDraft,
} from "../src/lib/expenseWorkflows.js";

test("expense date uses Santo Domingo calendar across UTC midnight", () => {
  assert.equal(localExpenseDate(new Date("2026-01-01T03:30:00Z")), "2025-12-31");
});

test("expense draft rejects zero, negative, nonnumeric and excessive precision", () => {
  for (const amount of ["0", "-1", "abc", "1.001"]) {
    assert.equal(
      "amount" in
        validateExpenseDraft({
          concept: "Utility",
          beneficiary: "Synthetic provider",
          amount,
          date: "2026-02-28",
          category: "otros",
          paymentMethod: "efectivo",
        }),
      true,
      "Expected amount to be rejected: " + amount,
    );
  }
});

test("expense amount normalization preserves decimal text without floating point rounding", () => {
  assert.equal(normalizeExpenseAmount("00012.5"), "12.50");
  assert.equal(normalizeExpenseAmount("9007199254740993.01"), "9007199254740993.01");
});

test("expense draft identifies field errors and rejects invalid calendar dates", () => {
  const errors = validateExpenseDraft({
    concept: "",
    beneficiary: "",
    amount: "1.00",
    date: "2026-02-30",
    category: "bad",
    paymentMethod: "bad",
  });
  assert.deepEqual(Object.keys(errors).sort(), [
    "beneficiary",
    "category",
    "concept",
    "date",
    "paymentMethod",
  ]);
  assert.ok(
    Object.values(errors).every((message) => typeof message === "string" && message.length > 0),
  );
});

test("expense filters combine fields and exclude annulled rows from active summaries", () => {
  const rows = [
    {
      concept: "Luz",
      beneficiary: "Proveedor A",
      category: "electricidad",
      paymentMethod: "transferencia",
      status: "registrado",
      date: "2026-04-30",
      amount: 100,
    },
    {
      concept: "Luz anulada",
      beneficiary: "Proveedor A",
      category: "electricidad",
      paymentMethod: "transferencia",
      status: "anulado",
      date: "2026-04-30",
      amount: 900,
    },
  ];
  assert.equal(
    filterExpenses(rows, {
      query: "proveedor",
      category: "electricidad",
      method: "transferencia",
      status: "todos",
      from: "2026-04-01",
      to: "2026-04-30",
    }).length,
    2,
  );
  assert.equal(
    filterExpenses(rows, {
      query: "luz",
      category: "electricidad",
      method: "transferencia",
      status: "anulado",
      from: "2026-04-30",
      to: "2026-04-30",
    }).length,
    1,
  );
  const result = summarizeExpenses(rows, "2026-04-30");
  assert.equal(result.periodTotal, 100);
  assert.equal(result.today.length, 1);
  assert.equal(result.month.length, 1);
  assert.equal(result.annulledCount, 1);
});
