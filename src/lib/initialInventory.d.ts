export function validateInitialInventory(
  value: unknown,
): { ok: true; quantity: number } | { ok: false; error: string };

export function createInitialInventoryRequest(
  productId: string,
  quantity: number,
  actorId: string | null,
  operationKey: string,
): {
  operation_id: string;
  idempotency_key: string;
  item_id: string;
  expected_quantity: 0;
  delta: number;
  reason: string;
};

export const INITIAL_REASON: string;
export const MAX_INITIAL_QUANTITY: number;
