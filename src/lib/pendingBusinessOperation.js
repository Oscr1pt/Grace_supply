const STORAGE_PREFIX = "grace.pending-business-operation.v1:";
const OPERATION_TYPES = new Set([
  "sale",
  "purchase",
  "expense",
  "financial_annulment",
  "inventory_adjustment",
]);

function storageKey(actorId) {
  if (typeof actorId !== "string" || !actorId.trim()) {
    throw new Error("No se puede conservar la operación sin una identidad autenticada.");
  }
  return `${STORAGE_PREFIX}${actorId}`;
}

function isValidOperation(value, actorId) {
  return Boolean(
    value &&
    typeof value === "object" &&
    value.actorId === actorId &&
    OPERATION_TYPES.has(value.type) &&
    typeof value.idempotencyKey === "string" &&
    value.idempotencyKey.length > 0 &&
    value.request &&
    typeof value.request === "object" &&
    !Array.isArray(value.request),
  );
}

export function readPendingBusinessOperation(storage, actorId) {
  const serialized = storage.getItem(storageKey(actorId));
  if (serialized === null) return null;
  let operation;
  try {
    operation = JSON.parse(serialized);
  } catch {
    throw new Error("La operación financiera pendiente no se pudo leer; no inicies otra.");
  }
  if (!isValidOperation(operation, actorId)) {
    throw new Error("La operación financiera pendiente está incompleta; no inicies otra.");
  }
  return operation;
}

export function persistPendingBusinessOperation(storage, actorId, operation) {
  const key = storageKey(actorId);
  const existing = readPendingBusinessOperation(storage, actorId);
  const next = { ...operation, actorId };
  if (!isValidOperation(next, actorId)) {
    throw new Error("No se pudo conservar el contexto de la operación pendiente.");
  }
  if (existing) {
    if (existing.idempotencyKey !== next.idempotencyKey || existing.type !== next.type) {
      throw new Error("Ya existe una operación financiera pendiente de conciliación.");
    }
    if (JSON.stringify(existing.request) !== JSON.stringify(next.request)) {
      throw new Error("La clave de idempotencia ya pertenece a otro contenido.");
    }
    return existing;
  }
  storage.setItem(key, JSON.stringify(next));
  return next;
}

export function clearPendingBusinessOperation(storage, actorId, idempotencyKey) {
  const key = storageKey(actorId);
  const existing = readPendingBusinessOperation(storage, actorId);
  if (!existing || existing.idempotencyKey !== idempotencyKey) return false;
  storage.removeItem(key);
  return true;
}
