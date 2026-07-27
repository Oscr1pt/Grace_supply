import { useCallback, useEffect, useState } from "react";
import { supabase, fromDb, toDb } from "./supabase";

/**
 * Generic hook that mirrors a whole Supabase table as a React state array.
 * Fetches on mount; exposes insert / update / remove for write-through.
 */
export function useSupabaseTable<T extends { id: string }>(
  table: string,
  orderBy = "created_at",
  orderAsc = false,
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data: rows, error } = await supabase
      .from(table)
      .select("*")
      .order(orderBy, { ascending: orderAsc });
    if (!error && rows) {
      setData(rows.map((r) => fromDb<T>(r as Record<string, unknown>)));
    }
    setLoading(false);
  }, [table, orderBy, orderAsc]);

  useEffect(() => { refresh(); }, [refresh]);

  const insert = useCallback(
    async (item: T) => {
      const { error } = await supabase.from(table).insert(toDb(item as Record<string, unknown>));
      if (error) throw new Error(error.message);
      setData((prev) => [item, ...prev]);
    },
    [table],
  );

  const update = useCallback(
    async (id: string, patch: Partial<T>) => {
      const { error } = await supabase
        .from(table)
        .update(toDb(patch as Record<string, unknown>))
        .eq("id", id);
      if (error) throw new Error(error.message);
      setData((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    },
    [table],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw new Error(error.message);
      setData((prev) => prev.filter((x) => x.id !== id));
    },
    [table],
  );

  return { data, loading, insert, update, remove, refresh, setData };
}

/** Legacy localStorage hook — kept only for settings migration compatibility. */
export function useLocalStore<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }, [key, value]);
  return [value, setValue] as const;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function fmtMoney(amount: number, currency = "DOP") {
  try {
    return new Intl.NumberFormat("es-DO", { style: "currency", currency }).format(amount);
  } catch {
    return `RD$${amount.toFixed(2)}`;
  }
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("es-DO");
}
