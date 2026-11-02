export type PendingBusinessOperation = {
  actorId: string;
  type: "sale" | "purchase" | "expense" | "financial_annulment";
  idempotencyKey: string;
  request: Record<string, unknown>;
  context?: unknown;
};

export function readPendingBusinessOperation(
  storage: Storage,
  actorId: string,
): PendingBusinessOperation | null;
export function persistPendingBusinessOperation(
  storage: Storage,
  actorId: string,
  operation: Omit<PendingBusinessOperation, "actorId">,
): PendingBusinessOperation;
export function clearPendingBusinessOperation(
  storage: Storage,
  actorId: string,
  idempotencyKey: string,
): boolean;
