import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type SalesRow = Database["public"]["Tables"]["sales"]["Row"];
export type ClientSalesHistoryLine = {
  name: string;
  quantity: number;
};
export type ClientSalesHistorySale = {
  id: string;
  receiptNo: string;
  clientId: string | null;
  clientNameSnapshot: string | null;
  total: SalesRow["total"];
  paymentType: "contado" | "credito" | null;
  createdAt: string;
  voidedAt: string | null;
  lines: ClientSalesHistoryLine[];
};

export const CLIENT_HISTORY_SALES_FAILURE_KEY: "Historial de ventas de clientes";
export const CLIENT_DELETE_HISTORY_FAILURE_KEY: "Verificación del historial del cliente";
export function setClientSalesHistoryFailure(message: string | null): void;
export function setClientDeleteHistoryFailure(message: string | null): void;
export function fetchClientSalesHistoryPage(
  client: SupabaseClient<Database>,
  clientId: string,
  page: number,
  signal?: AbortSignal,
): Promise<{
  sales: Array<Record<string, unknown> & { lines: Array<Record<string, unknown>> }>;
  hasMore: boolean;
}>;
export function checkClientHasHistory(
  client: SupabaseClient<Database>,
  clientId: string,
  signal?: AbortSignal,
): Promise<boolean>;
