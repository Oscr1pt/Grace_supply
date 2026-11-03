export function validateInventoryAdjustment({ currentQuantity, targetQuantity, reason }) {
  const target = typeof targetQuantity === "number" ? targetQuantity : Number(targetQuantity);
  const normalizedReason = String(reason ?? "").trim();
  if (!Number.isInteger(target) || target < 0) {
    return {
      ok: false,
      error: "La existencia objetivo debe ser un entero igual o mayor que cero.",
    };
  }
  if (normalizedReason.length < 1 || normalizedReason.length > 500) {
    return { ok: false, error: "Escribe un motivo de 1 a 500 caracteres." };
  }
  const delta = target - currentQuantity;
  if (delta === 0) {
    return { ok: false, error: "La existencia objetivo debe diferir de la existencia actual." };
  }
  return { ok: true, targetQuantity: target, delta, reason: normalizedReason };
}
