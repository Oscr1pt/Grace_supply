import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── snake_case ↔ camelCase helpers ──────────────────────────────────────────

function toSnake(key: string) {
  return key.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
}

function toCamel(key: string) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function toDb<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [toSnake(k), v]));
}

export function fromDb<T = Record<string, unknown>>(obj: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [toCamel(k), v]),
  ) as T;
}
