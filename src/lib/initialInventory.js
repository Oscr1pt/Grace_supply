const MAX_INITIAL_QUANTITY = 2147483647;
const INITIAL_REASON = "Existencia inicial al registrar producto";

export function validateInitialInventory(value) {
  const text = String(value ?? "");
  if (!/^\d+$/.test(text)) {
    return { ok: false, error: "La existencia inicial debe ser un entero no negativo." };
  }
  const quantity = Number(text);
  if (!Number.isSafeInteger(quantity) || quantity > MAX_INITIAL_QUANTITY) {
    return { ok: false, error: "La existencia inicial supera el límite permitido." };
  }
  return { ok: true, quantity };
}

export function createInitialInventoryRequest(productId, quantity, _actorId, operationKey) {
  return {
    operation_id: operationKey,
    idempotency_key: operationKey,
    item_id: productId,
    expected_quantity: 0,
    delta: quantity,
    reason: INITIAL_REASON,
  };
}

export { INITIAL_REASON, MAX_INITIAL_QUANTITY };
