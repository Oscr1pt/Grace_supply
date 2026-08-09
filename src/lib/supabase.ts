import { createClient } from "@supabase/supabase-js";

function getEnvVar(name: string): string | undefined {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    if (import.meta.env[name]) return import.meta.env[name] as string;
  }
  if (typeof process !== "undefined" && process.env) {
    if (process.env[name]) return process.env[name] as string;
  }
  return undefined;
}

function sanitizeSupabaseUrl(rawUrl?: string): string {
  if (!rawUrl) return "";
  let url = rawUrl.trim();
  url = url.replace(/\/+$/, "");
  url = url.replace(/\/rest\/v1\/?$/, "");
  return url;
}

const rawSupabaseUrl =
  getEnvVar("VITE_SUPABASE_URL") ||
  getEnvVar("NEXT_PUBLIC_SUPABASE_URL") ||
  getEnvVar("SUPABASE_URL") ||
  "";

const supabaseAnonKey =
  getEnvVar("VITE_SUPABASE_ANON_KEY") ||
  getEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
  getEnvVar("SUPABASE_ANON_KEY") ||
  "";

export const supabaseUrl = sanitizeSupabaseUrl(rawSupabaseUrl);
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
