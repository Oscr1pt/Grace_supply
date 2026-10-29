const PENDING_PAYMENT_STORAGE_KEY = "grace-supply.pending-credit-payment.v1";
const MAX_MONEY_CENTS = 99_999_999_999_999;

export function parseMoneyToCents(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_MONEY_CENTS ? cents : null;
}

export function formatMoneyFromCents(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_MONEY_CENTS) {
    throw new Error("El importe no se puede representar con precisión monetaria.");
  }
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function persistPendingCreditPayment(storage, operation) {
  const existing = readPendingCreditPayment(storage);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(operation)) {
      throw new Error("Hay un pago pendiente de conciliación; no se puede iniciar otra operación.");
    }
    return existing;
  }
  if (!isValidPendingPayment(operation)) {
    throw new Error("No se pudo conservar el contexto del pago pendiente.");
  }
  storage.setItem(PENDING_PAYMENT_STORAGE_KEY, JSON.stringify(operation));
  return operation;
}

export function readPendingCreditPayment(storage) {
  const raw = storage.getItem(PENDING_PAYMENT_STORAGE_KEY);
  if (raw == null) return null;
  let operation;
  try {
    operation = JSON.parse(raw);
  } catch {
    throw new Error(
      "El pago pendiente no se pudo leer; no inicies otro pago hasta recuperar su operación.",
    );
  }
  if (!isValidPendingPayment(operation)) {
    throw new Error(
      "El pago pendiente está incompleto; no inicies otro pago hasta recuperar su operación.",
    );
  }
  return operation;
}

export function clearPendingCreditPayment(storage, key) {
  const existing = readPendingCreditPayment(storage);
  if (!existing || existing.idempotencyKey !== key) return false;
  storage.removeItem(PENDING_PAYMENT_STORAGE_KEY);
  return true;
}

export function localDateInDominicanRepublic(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function matchesLegacySupplierName(
  recordSupplierId,
  recordSupplierName,
  supplier,
  suppliers,
) {
  if (recordSupplierId) return recordSupplierId === supplier.id;
  const legacyKey = normalizeSupplierName(recordSupplierName);
  if (!legacyKey) return false;
  const matches = suppliers.filter(
    (candidate) => normalizeSupplierName(candidate.name) === legacyKey,
  );
  return matches.length === 1 && matches[0].id === supplier.id;
}

export function summarizeCredits(credits) {
  return credits.reduce(
    (totals, credit) => {
      if (credit.status === "anulada") return totals;
      totals.original += Number(credit.total) || 0;
      totals.paid += Number(credit.paid) || 0;
      totals.balance += Number(credit.balance) || 0;
      return totals;
    },
    { original: 0, paid: 0, balance: 0 },
  );
}

function normalizeSupplierName(value) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-DO")
    : "";
}

export function validatePartyForm(form) {
  const errors = {};
  if (!String(form.name ?? "").trim()) errors.name = "Escribe un nombre o razón social.";
  const email = String(form.email ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Escribe un correo válido o deja este campo vacío.";
  }
  return errors;
}

function isValidPendingPayment(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof value.actorId === "string" &&
    value.actorId &&
    ["client_payment", "supplier_payment"].includes(value.operation) &&
    ["client", "supplier"].includes(value.creditType) &&
    typeof value.creditId === "string" &&
    value.creditId &&
    typeof value.idempotencyKey === "string" &&
    value.idempotencyKey &&
    value.request &&
    typeof value.request === "object" &&
    value.request.idempotency_key === value.idempotencyKey &&
    value.request.credit_id === value.creditId &&
    value.request.credit_type === value.creditType &&
    value.operation === `${value.creditType}_payment`,
  );
}
