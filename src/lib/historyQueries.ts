import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PostgrestError } from "@supabase/supabase-js";
import { useAuth } from "./auth";
import { resolveHistoryDateRange } from "./historyDateRange.js";
import { fromDb, supabase } from "./supabase";
import type { Database } from "./database.types";
import type { Purchase, PurchaseHistoryLine, Sale, SaleLine } from "./types";
import type { HistoryPeriod } from "./historyDateRange.js";

export type SalesHistoryRecord = Sale & {
  clientName: string | null;
  pieceCount: number;
};

export type HistoryFilters = {
  search: string;
  period: HistoryPeriod;
  from: string;
  to: string;
  page: number;
};

type HistoryEnvelope = { total_count: number | string; records: Record<string, unknown>[] };
type HistoryState<T> = {
  records: T[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  dateError: string | null;
};

const initialState = <T>(): HistoryState<T> => ({
  records: [],
  totalCount: 0,
  loading: true,
  error: null,
  dateError: null,
});

function parseEnvelope(value: unknown): HistoryEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Respuesta inválida del historial.");
  }
  const payload = value as Record<string, unknown>;
  const totalCount = Number(payload.total_count);
  if (!Number.isSafeInteger(totalCount) || totalCount < 0 || !Array.isArray(payload.records)) {
    throw new Error("Respuesta incompleta del historial.");
  }
  if (
    payload.records.some((record) => !record || typeof record !== "object" || Array.isArray(record))
  ) {
    throw new Error("El historial contiene registros inválidos.");
  }
  return { total_count: totalCount, records: payload.records as Record<string, unknown>[] };
}

function mapSalesRecord(row: Record<string, unknown>): SalesHistoryRecord {
  return {
    id: String(row.id),
    receiptNo: String(row.receipt_no ?? ""),
    clientId: typeof row.client_id === "string" ? row.client_id : null,
    clientNameSnapshot:
      typeof row.client_name_snapshot === "string" ? row.client_name_snapshot : null,
    clientName: typeof row.client_name === "string" ? row.client_name : null,
    pieceCount: Number(row.piece_count ?? 0),
    lines: [],
    subtotal: Number(row.subtotal ?? 0),
    taxRate: Number(row.tax_rate ?? 0),
    tax: Number(row.tax ?? 0),
    total: Number(row.total ?? 0),
    taxPolicyVersion: typeof row.tax_policy_version === "string" ? row.tax_policy_version : null,
    taxCalculationEnabled: row.tax_calculation_enabled === true,
    paymentType: row.payment_type === "credito" ? "credito" : "contado",
    dueDate: typeof row.due_date === "string" ? row.due_date : undefined,
    createdAt: String(row.created_at ?? ""),
    voidedAt: typeof row.voided_at === "string" ? row.voided_at : undefined,
    voidReason: typeof row.void_reason === "string" ? row.void_reason : undefined,
  };
}

function mapPurchaseRecord(row: Record<string, unknown>): Purchase {
  const summary = Array.isArray(row.line_summary)
    ? row.line_summary.flatMap((line) => {
        if (!line || typeof line !== "object" || Array.isArray(line)) return [];
        const value = line as Record<string, unknown>;
        return typeof value.name === "string"
          ? [
              {
                name: value.name,
                quantity: Number(value.quantity ?? 0),
                itemId:
                  typeof value.item_id === "string"
                    ? value.item_id
                    : value.item_id === null
                      ? null
                      : undefined,
              },
            ]
          : [];
      })
    : [];
  return {
    id: String(row.id),
    supplier: String(row.supplier ?? ""),
    supplierId: typeof row.supplier_id === "string" ? row.supplier_id : undefined,
    itemId: typeof row.item_id === "string" ? row.item_id : undefined,
    description: String(row.description ?? ""),
    quantity: row.quantity === null ? 0 : Number(row.quantity ?? 0),
    unitCost: row.unit_cost === null ? 0 : Number(row.unit_cost ?? 0),
    total: Number(row.total ?? 0),
    paymentType: row.payment_type === "credito" ? "credito" : "contado",
    invoiceNo: typeof row.invoice_no === "string" ? row.invoice_no : undefined,
    dueDate: typeof row.due_date === "string" ? row.due_date : undefined,
    createdAt: String(row.created_at ?? ""),
    voidedAt: typeof row.voided_at === "string" ? row.voided_at : undefined,
    voidReason: typeof row.void_reason === "string" ? row.void_reason : undefined,
    lineCount: Number(row.line_count ?? 0),
    lineSummary: summary,
  };
}

function historyErrorMessage(error: PostgrestError | Error) {
  if ("code" in error && error.code === "42501") {
    return "No tienes permiso para consultar este historial.";
  }
  return "No se pudo cargar el historial. Comprueba tu conexión e inténtalo de nuevo.";
}

function useHistoryPage<T>(
  kind: "sales" | "purchases",
  filters: HistoryFilters,
  mapRecord: (row: Record<string, unknown>) => T,
) {
  const { authReady, scopeKey, user } = useAuth();
  const [state, setState] = useState<HistoryState<T>>(() => initialState<T>());
  const [reloadKey, setReloadKey] = useState(0);
  const requestSequence = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const period = filters.period;
  const from = filters.from;
  const to = filters.to;
  const page = filters.page;
  const search = filters.search.trim();
  const range = useMemo(() => {
    try {
      return {
        value: resolveHistoryDateRange({ period, from, to }),
        error: null as string | null,
      };
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : "El rango de fechas no es válido.",
      };
    }
  }, [period, from, to]);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    activeController.current?.abort();
    if (!authReady || !user?.authUserId) {
      setState({ ...initialState<T>(), loading: !authReady });
      return;
    }
    if (range.error || !range.value) {
      setState({ records: [], totalCount: 0, loading: false, error: null, dateError: range.error });
      return;
    }

    const controller = new AbortController();
    activeController.current = controller;
    setState((current) => ({ ...current, loading: true, error: null, dateError: null }));
    const current = () => requestSequence.current === sequence && !controller.signal.aborted;
    const rpc = kind === "sales" ? "search_sales_history" : "search_purchases_history";
    void (async () => {
      try {
        const { data, error } = await supabase
          .rpc(rpc, {
            p_search: search || null,
            p_from: range.value.fromInclusive,
            p_to_exclusive: range.value.toExclusive,
            p_page: page,
          })
          .abortSignal(controller.signal);
        if (!current()) return;
        if (error) throw error;
        const payload = parseEnvelope(data);
        setState({
          records: payload.records.map(mapRecord),
          totalCount: Number(payload.total_count),
          loading: false,
          error: null,
          dateError: null,
        });
      } catch (error: unknown) {
        if (!current()) return;
        const normalized =
          error && typeof error === "object" && "code" in error
            ? (error as PostgrestError)
            : error instanceof Error
              ? error
              : new Error("Unknown history request error");
        setState({
          records: [],
          totalCount: 0,
          loading: false,
          error: historyErrorMessage(normalized),
          dateError: null,
        });
      }
    })();

    return () => {
      controller.abort();
      if (requestSequence.current === sequence) requestSequence.current += 1;
    };
  }, [authReady, kind, mapRecord, page, range, reloadKey, scopeKey, search, user?.authUserId]);

  useEffect(
    () => () => {
      activeController.current?.abort();
      requestSequence.current += 1;
    },
    [],
  );

  const refresh = useCallback(() => setReloadKey((current) => current + 1), []);
  return { ...state, refresh };
}

export function useSalesHistory(filters: HistoryFilters) {
  return useHistoryPage("sales", filters, mapSalesRecord);
}

export function usePurchasesHistory(filters: HistoryFilters) {
  return useHistoryPage("purchases", filters, mapPurchaseRecord);
}

export async function loadSaleHistoryLines(
  saleId: string,
  signal: AbortSignal,
): Promise<SaleLine[]> {
  const { data, error } = await supabase
    .from("sale_lines")
    .select("item_id,sku,name,unit_price,quantity,tax_classification")
    .eq("sale_id", saleId as Database["public"]["Tables"]["sale_lines"]["Row"]["sale_id"])
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .abortSignal(signal);
  if (error) throw error;
  return (data ?? []).map((row) => fromDb<SaleLine>(row as Record<string, unknown>));
}

export async function loadPurchaseHistoryLines(
  purchaseId: string,
  signal: AbortSignal,
): Promise<PurchaseHistoryLine[]> {
  const { data, error } = await supabase
    .from("purchase_lines")
    .select("line_number,item_id,sku_snapshot,name_snapshot,quantity,unit_cost,subtotal,restocked")
    .eq(
      "purchase_id",
      purchaseId as Database["public"]["Tables"]["purchase_lines"]["Row"]["purchase_id"],
    )
    .order("line_number", { ascending: true })
    .abortSignal(signal);
  if (error) throw error;
  return (data ?? []).map((row) => fromDb<PurchaseHistoryLine>(row as Record<string, unknown>));
}
