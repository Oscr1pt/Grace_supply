export type InventoryAdjustmentValidation =
  | { ok: false; error: string }
  | { ok: true; targetQuantity: number; delta: number; reason: string };

export function validateInventoryAdjustment(input: {
  currentQuantity: number;
  targetQuantity: number | string;
  reason: string;
}): InventoryAdjustmentValidation;
