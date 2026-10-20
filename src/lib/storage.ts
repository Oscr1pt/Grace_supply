import { useCallback, useEffect, useState } from "react";
import { supabase, fromDb, toDb } from "./supabase";

function getLocal<T>(table: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`lustre_${table}`);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function setLocal<T>(table: string, items: T[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`lustre_${table}`, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

/**
 * Generic hook that mirrors a whole table (Supabase + localStorage fallback).
 * Enables seamless offline and local development while syncing with Supabase when available.
 */
export function useSupabaseTable<T extends { id: string }>(
  table: string,
  orderBy = "created_at",
  orderAsc = false,
) {
  const [data, setData] = useState<T[]>(() => getLocal<T>(table));
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data: rows, error } = await supabase
        .from(table)
        .select("*")
        .order(orderBy, { ascending: orderAsc });
      if (!error && rows) {
        const parsed = rows.map((r) => fromDb<T>(r as Record<string, unknown>));
        setData(parsed);
        setLocal(table, parsed);
      } else {
        const local = getLocal<T>(table);
        if (local.length > 0) setData(local);
      }
    } catch {
      const local = getLocal<T>(table);
      if (local.length > 0) setData(local);
    }
    setLoading(false);
  }, [table, orderBy, orderAsc]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const insert = useCallback(
    async (item: T) => {
      try {
        await supabase.from(table).insert(toDb(item as Record<string, unknown>));
      } catch {
        /* fallback to local storage */
      }
      setData((prev) => {
        const next = [item, ...prev.filter((x) => x.id !== item.id)];
        setLocal(table, next);
        return next;
      });
    },
    [table],
  );

  const update = useCallback(
    async (id: string, patch: Partial<T>) => {
      try {
        await supabase
          .from(table)
          .update(toDb(patch as Record<string, unknown>))
          .eq("id", id);
      } catch {
        /* fallback to local storage */
      }
      setData((prev) => {
        const next = prev.map((x) => (x.id === id ? { ...x, ...patch } : x));
        setLocal(table, next);
        return next;
      });
    },
    [table],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await supabase.from(table).delete().eq("id", id);
      } catch {
        /* fallback to local storage */
      }
      setData((prev) => {
        const next = prev.filter((x) => x.id !== id);
        setLocal(table, next);
        return next;
      });
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
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
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
