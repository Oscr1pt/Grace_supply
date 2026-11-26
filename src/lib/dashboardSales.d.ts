import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type SalesRow = Database["public"]["Tables"]["sales"]["Row"];
export type DashboardMonthlySale = {
  id: string;
  total: SalesRow["total"];
  paymentType?: "contado" | "credito" | null;
  createdAt: string;
  voidedAt?: string | null;
};
export type DashboardRecentSale = {
  id: string;
  total: SalesRow["total"];
  receiptNo: string;
  clientId: string | null;
  clientNameSnapshot?: string | null;
  paymentType?: "contado" | "credito" | null;
  createdAt: string;
};

export const DASHBOARD_MONTH_SALES_FAILURE_KEY: "Ventas del mes (Panel General)";
export const DASHBOARD_RECENT_SALES_FAILURE_KEY: "Ventas recientes (Panel General)";
export function getDashboardSalesRange(now?: Date): { start: string; endExclusive: string };
export function getDashboardSalesRangeForMonth(month: string): {
  start: string;
  endExclusive: string;
};
export function fetchDashboardMonthlySales(
  client: SupabaseClient<Database>,
  range: { start: string; endExclusive: string },
  signal?: AbortSignal,
): Promise<Array<Pick<SalesRow, "id" | "total" | "payment_type" | "created_at">>>;
export function fetchRecentDashboardSales(
  client: SupabaseClient<Database>,
  signal?: AbortSignal,
): Promise<
  Array<
    Pick<
      SalesRow,
      | "id"
      | "receipt_no"
      | "client_id"
      | "client_name_snapshot"
      | "total"
      | "payment_type"
      | "created_at"
    >
  >
>;
export function calculateDashboardSalesMetrics(
  sales: ReadonlyArray<{
    total: string | number;
    paymentType?: "contado" | "credito" | null;
    createdAt: string;
    voidedAt?: string | null;
  }>,
  now?: Date,
): {
  monthSalesAmount: number;
  monthSalesCount: number;
  monthCashSalesAmount: number;
  monthCashSalesCount: number;
  monthCreditSalesCount: number;
  monthUnclassifiedSalesCount: number;
  salesTodayCount: number;
};
