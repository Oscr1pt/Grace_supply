export type CreditPaymentOperation = {
  actorId: string;
  operation: "client_payment" | "supplier_payment";
  creditType: "client" | "supplier";
  creditId: string;
  idempotencyKey: string;
  request: Record<string, unknown> & {
    idempotency_key: string;
    credit_type: "client" | "supplier";
    credit_id: string;
    amount: string;
  };
};

export function parseMoneyToCents(value: string | number): number | null;
export function formatMoneyFromCents(cents: number): string;
export function persistPendingCreditPayment(
  storage: Storage,
  operation: CreditPaymentOperation,
): CreditPaymentOperation;
export function readPendingCreditPayment(storage: Storage): CreditPaymentOperation | null;
export function clearPendingCreditPayment(storage: Storage, key: string): boolean;
export function localDateInDominicanRepublic(date?: Date): string;
export function matchesLegacySupplierName(
  recordSupplierId: string | null | undefined,
  recordSupplierName: string,
  supplier: { id: string; name: string },
  suppliers: Array<{ id: string; name: string }>,
): boolean;
export function summarizeCredits<
  T extends { total: number; paid: number; balance: number; status: string },
>(credits: T[]): { original: number; paid: number; balance: number };
export function validatePartyForm(form: {
  name?: string;
  email?: string;
}): Partial<Record<"name" | "email", string>>;
