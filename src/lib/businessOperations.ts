import { supabase } from "./supabase";
import { PersistenceError, persistenceFailure } from "./persistence.js";

export type BusinessOperation = "sale" | "purchase" | "client_payment" | "supplier_payment" | "inventory_adjustment" | "expense" | "financial_annulment" | "payment_reversal";
export type BusinessResult = Record<string, unknown> & { operation_id: string };

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

const rpc = supabase as unknown as RpcClient;
const knownBusinessErrors = new Set(["22023", "23503", "23505", "23514", "40001", "42501", "55000"]);

function businessResult(value: unknown): BusinessResult | null {
  return value && typeof value === "object" && "operation_id" in value && typeof value.operation_id === "string"
    ? value as BusinessResult
    : null;
}

/** One financial intent maps to one PostgreSQL transaction and one stable key. */
export async function postBusinessOperation(
  operation: BusinessOperation,
  request: Record<string, unknown> & { idempotency_key: string },
): Promise<BusinessResult> {
  const functionName = operation === "sale" ? "post_sale"
    : operation === "purchase" ? "post_purchase"
      : operation === "inventory_adjustment" ? "adjust_inventory"
        : operation === "expense" ? "post_expense" : operation === "financial_annulment" ? "annul_financial_document"
          : operation === "payment_reversal" ? "reverse_credit_payment" : "post_credit_payment";
  const response = await rpc.rpc(functionName, { p_request: request });
  if (!response.error) {
    const result = businessResult(response.data);
    if (result) return result;
    throw new PersistenceError("uncertain", "La operación no devolvió una confirmación persistida identificable.");
  }

  // A database rejection is definitive; do not hide it behind a stale result lookup.
  if (response.error.code && knownBusinessErrors.has(response.error.code)) {
    if (response.error.code === "55000" && operation === "sale") {
      throw new PersistenceError("validation", "La política de cálculo tributario requiere aprobación antes de registrar ventas.");
    }
    if (response.error.code === "40001") {
      throw new PersistenceError("conflict", "Los datos cambiaron mientras se preparaba la operación. Actualiza y confirma de nuevo.");
    }
    throw persistenceFailure(response.error);
  }

  // Network/server errors can happen after commit. Query only the same actor/type/key.
  const result = await getConfirmedBusinessOperation(operation, request.idempotency_key);
  if (result) return result;
  throw new PersistenceError("uncertain", "No se pudo confirmar el resultado. Conserva la operación pendiente y reconcilia antes de repetir.");
}

/** Administrative financial corrections also use a stable CHG-07 idempotency key. */
export async function runFinancialCorrection(
  operation: "financial_annulment" | "payment_reversal",
  request: Record<string, unknown> & { idempotency_key: string },
): Promise<BusinessResult> {
  return postBusinessOperation(operation, request);
}

export async function getConfirmedBusinessOperation(operation: BusinessOperation, idempotencyKey: string): Promise<BusinessResult | null> {
  const reconciled = await rpc.rpc("get_business_operation", {
    p_operation_type: operation,
    p_idempotency_key: idempotencyKey,
  });
  if (reconciled.error) throw persistenceFailure(reconciled.error, false);
  return businessResult(reconciled.data);
}
