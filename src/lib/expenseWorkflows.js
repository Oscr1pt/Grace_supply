const CATEGORY_SET = new Set([
  "nomina",
  "alquiler",
  "electricidad",
  "agua",
  "internet",
  "telefono",
  "transporte",
  "combustible",
  "mantenimiento",
  "papeleria",
  "limpieza",
  "publicidad",
  "servicios_profesionales",
  "comisiones",
  "impuestos",
  "otros",
]);
const METHOD_SET = new Set(["transferencia", "efectivo", "tarjeta", "cheque", "otro"]);

export function localExpenseDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function validateExpenseDraft(draft) {
  const errors = {};
  if (!String(draft.concept ?? "").trim()) errors.concept = "Escribe el concepto del gasto.";
  if (!String(draft.beneficiary ?? "").trim()) errors.beneficiary = "Indica quién recibió el pago.";
  const amount = String(draft.amount ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || !/[1-9]/.test(amount.replace(".", ""))) {
    errors.amount = "El importe debe ser mayor que cero y tener hasta dos decimales.";
  }
  const date = String(draft.date ?? "");
  const parsedDate = new Date(`${date}T12:00:00`);
  const dateParts = date.split("-").map(Number);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsedDate.valueOf()) ||
    parsedDate.getFullYear() !== dateParts[0] ||
    parsedDate.getMonth() + 1 !== dateParts[1] ||
    parsedDate.getDate() !== dateParts[2]
  ) {
    errors.date = "Selecciona una fecha válida.";
  }
  if (!CATEGORY_SET.has(draft.category)) errors.category = "Selecciona una categoría válida.";
  if (!METHOD_SET.has(draft.paymentMethod))
    errors.paymentMethod = "Selecciona un método de pago válido.";
  return errors;
}

export function normalizeExpenseAmount(amount) {
  const value = String(amount ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value) || !/[1-9]/.test(value.replace(".", ""))) {
    throw new RangeError("Expense amount must be positive with at most two decimals.");
  }
  const [whole, fraction = ""] = value.split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
}

export function filterExpenses(expenses, filters) {
  const query = String(filters.query ?? "")
    .trim()
    .toLocaleLowerCase("es-DO");
  return expenses.filter((expense) => {
    const text = [
      expense.concept,
      expense.beneficiary,
      expense.reference,
      expense.description,
      expense.note,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("es-DO");
    return (
      (!query || text.includes(query)) &&
      (filters.category === "todos" || expense.category === filters.category) &&
      (filters.method === "todos" || expense.paymentMethod === filters.method) &&
      (filters.status === "todos" || expense.status === filters.status) &&
      (!filters.from || expense.date >= filters.from) &&
      (!filters.to || expense.date <= filters.to)
    );
  });
}

export function summarizeExpenses(expenses, today) {
  const active = expenses.filter((expense) => expense.status === "registrado");
  const month = today.slice(0, 7);
  return {
    periodTotal: active.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    today: active.filter((expense) => expense.date === today),
    month: active.filter((expense) => expense.date.startsWith(month)),
    annulledCount: expenses.filter((expense) => expense.status === "anulado").length,
  };
}
