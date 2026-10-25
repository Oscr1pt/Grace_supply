import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, fromDb, toDb } from "./supabase";
import { useAuth } from "./auth";
import { createScopeRequestGuard } from "./sessionScope.js";
import type { Database, UUID } from "./database.types";
import type { SaleLine } from "./types";
import {
  confirmMutation,
  confirmRows,
  createRequestGuard,
  executeAndReconcile,
  PersistenceError,
  persistenceFailure,
  serializeMutation,
  setReadFailure,
  userPersistenceMessage,
  type PersistenceErrorKind,
} from "./persistence.js";

type DomainTable = keyof Database["public"]["Tables"];
type DomainView = keyof Database["public"]["Views"];
const serverTimestampTables = new Set<DomainTable>(["clients", "suppliers", "inventory", "expenses"]);

function toMutationDb(table: DomainTable, value: Record<string, unknown>) {
  const row = toDb(value);
  if (serverTimestampTables.has(table)) delete row.created_at;
  return row;
}

function toUpdateDb(table: DomainTable, value: Record<string, unknown>) {
  const row = toMutationDb(table, value);
  delete row.id;
  return row;
}

function withoutSaleLines<T extends { id: string }>(item: T) {
  const { lines, ...sale } = item as T & { lines?: SaleLine[] };
  return { sale, lines: lines ?? [] };
}

/** Private rows are kept in memory only for the current mounted auth scope. */
export function useSupabaseTable<T extends { id: string }>(
  table: DomainTable,
  orderBy = "created_at",
  orderAsc = false,
  selectColumns = "*",
  enabled = true,
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorKind, setLoadErrorKind] = useState<PersistenceErrorKind | null>(null);
  const { scopeKey } = useAuth();
  const requestGuard = useRef(createRequestGuard());
  const scopeGuard = useRef(createScopeRequestGuard(scopeKey));
  const abortController = useRef<AbortController | null>(null);
  scopeGuard.current.update(scopeKey);

  const refresh = useCallback(async () => {
    const request = requestGuard.current.begin();
    const requestScope = scopeGuard.current.capture();
    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    const isCurrent = () =>
      requestGuard.current.isCurrent(request) &&
      scopeGuard.current.isCurrent(requestScope) &&
      !controller.signal.aborted;
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from(table)
        .select(selectColumns as "*")
        .order(orderBy, { ascending: orderAsc })
        .abortSignal(controller.signal);
      if (error) throw persistenceFailure(error);
      let parsed = (rows ?? []).map((r) => fromDb<T>(r as Record<string, unknown>));
      if (table === "sales" && parsed.length > 0) {
        const saleIds = parsed.map((row) => row.id);
        const { data: lineRows, error: lineError } = await supabase
          .from("sale_lines")
          .select("*")
          .in("sale_id", saleIds as UUID[])
          .abortSignal(controller.signal);
        if (lineError) throw persistenceFailure(lineError);

        const linesBySale = new Map<string, SaleLine[]>();
        for (const row of lineRows ?? []) {
          const line = fromDb<SaleLine & { saleId: string }>(
            row as unknown as Record<string, unknown>,
          );
          const saleLines = linesBySale.get(line.saleId) ?? [];
          saleLines.push(line);
          linesBySale.set(line.saleId, saleLines);
        }
        parsed = parsed.map((row) => ({ ...row, lines: linesBySale.get(row.id) ?? [] } as T));
      }
      if (!isCurrent()) return;
      setData(parsed);
      setStale(false);
      setLoadError(null);
      setLoadErrorKind(null);
      setReadFailure(table, null);
    } catch (error) {
      if (!isCurrent()) return;
      const failure = persistenceFailure(error);
      if (failure.kind === "denied") setData([]);
      const message = userPersistenceMessage(failure);
      setLoadError(message);
      setLoadErrorKind(failure.kind);
      setStale(true);
      setReadFailure(table, message);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [table, orderBy, orderAsc, selectColumns, scopeKey]);

  useEffect(() => {
    if (!enabled) {
      abortController.current?.abort();
      requestGuard.current.begin();
      setData([]);
      setLoading(false);
      setStale(true);
      setLoadError(null);
      setLoadErrorKind(null);
      return;
    }
    void refresh();
    return () => {
      abortController.current?.abort();
      requestGuard.current.begin();
    };
  }, [refresh, enabled]);

  const insert = useCallback(
    async (item: T) => {
      await serializeMutation(`${table}:${item.id}`, async () => {
        if (table === "sales") {
          const { sale, lines } = withoutSaleLines(item);
          const persistedSale = await executeAndReconcile(
          () => supabase.from("sales").insert(toMutationDb("sales", sale as Record<string, unknown>) as never).select("*"),
            () => supabase.from("sales").select("*").eq("id", item.id as UUID).maybeSingle(),
            { id: item.id },
          );
          if (lines.length > 0) {
            const rows = lines.map((line) => ({
              ...line,
              id: (line as SaleLine & { id?: string }).id ?? globalThis.crypto.randomUUID(),
              saleId: item.id,
            }));
            const lineIds = rows.map((line) => line.id);
            try {
              const lineResponse = await supabase.from("sale_lines").insert(
                rows.map((line) => toDb(line as unknown as Record<string, unknown>)) as never,
              ).select("id");
              await confirmRows(lineResponse, lines.length);
            } catch (error) {
              const failure = persistenceFailure(error, true);
              let confirmedLineIds: string[] = [];
              if (failure.kind === "uncertain" || failure.kind === "conflict") {
                try {
                  const read = await supabase.from("sale_lines").select("id").in("id", lineIds as UUID[]);
                  confirmedLineIds = (await confirmRows(read, lines.length)).map((row) => row.id);
                } catch {
                  // The original result remains uncertain; do not retry the line insert.
                }
              }
              if (confirmedLineIds.length !== lines.length) {
                throw new PersistenceError(
                  "uncertain",
                  "La venta se guardó, pero no se confirmó todo su detalle. Revisa la venta antes de repetirla.",
                  [item.id, ...confirmedLineIds],
                );
              }
            }
          }
          const confirmed = { ...fromDb<T>(persistedSale as Record<string, unknown>), lines } as T;
          setData((prev) => {
            const next = [confirmed, ...prev.filter((x) => x.id !== confirmed.id)];
            return next;
          });
          return;
        }

        const persisted = await executeAndReconcile(
          () => supabase.from(table).insert(toMutationDb(table, item as Record<string, unknown>) as never).select("*"),
          () => supabase.from(table).select("*").eq("id", item.id as UUID).maybeSingle(),
          { id: item.id },
        );
        const confirmed = fromDb<T>(persisted as Record<string, unknown>);
        setData((prev) => {
          const next = [confirmed, ...prev.filter((x) => x.id !== confirmed.id)];
          return next;
        });
      });
    },
    [table],
  );

  const update = useCallback(
    async (id: string, patch: Partial<T>) => {
      await serializeMutation(`${table}:${id}`, async () => {
        const response = await supabase
          .from(table)
          .update(toUpdateDb(table, patch as Record<string, unknown>) as never)
          .eq("id", id as UUID)
          .select("*");
        const persisted = await confirmMutation(response, { id });
        const confirmed = fromDb<T>(persisted as Record<string, unknown>);
        setData((prev) => {
          const next = prev.some((x) => x.id === id)
            ? prev.map((x) => (x.id === id ? confirmed : x))
            : [confirmed, ...prev];
          return next;
        });
      });
    },
    [table],
  );

  const remove = useCallback(
    async (id: string) => {
      await serializeMutation(`${table}:${id}`, async () => {
        const response = await supabase.from(table).delete().eq("id", id as UUID).select("id");
        await confirmMutation(response, { id });
        setData((prev) => {
          const next = prev.filter((x) => x.id !== id);
          return next;
        });
      });
    },
    [table],
  );

  return {
    data,
    loading,
    stale,
    loadError,
    loadErrorKind,
    insert,
    update,
    remove,
    refresh,
    setData,
  };
}

/** Read-only, non-cached access to the least-privilege lookup views in CHG-05. */
export function useSupabaseView<V extends DomainView>(view: V, orderBy?: string) {
  type Row = Database["public"]["Views"][V]["Row"];
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { scopeKey } = useAuth();
  const requestGuard = useRef(createRequestGuard());
  const scopeGuard = useRef(createScopeRequestGuard(scopeKey));
  const abortController = useRef<AbortController | null>(null);
  scopeGuard.current.update(scopeKey);

  const refresh = useCallback(async () => {
    const request = requestGuard.current.begin();
    const requestScope = scopeGuard.current.capture();
    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    const isCurrent = () =>
      requestGuard.current.isCurrent(request) &&
      scopeGuard.current.isCurrent(requestScope) &&
      !controller.signal.aborted;
    setLoading(true);
    try {
      const query = supabase.from(view).select("*").abortSignal(controller.signal);
      const { data: rows, error } = orderBy ? await query.order(orderBy) : await query;
      if (error) throw persistenceFailure(error);
      if (!isCurrent()) return;
      setData((rows ?? []) as unknown as Row[]);
      setLoadError(null);
      setReadFailure(view, null);
    } catch (error) {
      if (!isCurrent()) return;
      const message = userPersistenceMessage(error);
      setData([]);
      setLoadError(message);
      setReadFailure(view, message);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [view, orderBy, scopeKey]);

  useEffect(() => {
    void refresh();
    return () => {
      abortController.current?.abort();
      requestGuard.current.begin();
    };
  }, [refresh]);
  return { data, loading, loadError, refresh };
}

export function uid() {
  return globalThis.crypto.randomUUID() as UUID;
}

export function fmtMoney(amount: number, currency = "DOP") {
  try {
    return new Intl.NumberFormat("es-DO", { style: "currency", currency }).format(amount);
  } catch {
    return `RD$${amount.toFixed(2)}`;
  }
}

export function fmtDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-DO", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
