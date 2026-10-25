import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { initialAuthCallback } from "./authCallback.js";

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

const tabSessionStorage = {
  getItem(key: string) {
    try {
      return typeof window === "undefined" ? null : window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      if (typeof window !== "undefined") window.sessionStorage.setItem(key, value);
    } catch {
      // The Auth client still holds the verified session in memory for this tab.
    }
  },
  removeItem(key: string) {
    try {
      if (typeof window !== "undefined") window.sessionStorage.removeItem(key);
    } catch {
      // A blocked browser storage API must not prevent local sign-out.
    }
  },
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: tabSessionStorage,
    flowType: initialAuthCallback.flowType,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export function clearLegacyLocalSessionAndDataCache() {
  if (typeof window === "undefined") return;
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("lustre_")) window.localStorage.removeItem(key);
    }
  } catch {
    // Auth remains authoritative if browser storage is unavailable.
  }
}

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
