import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";

export const PERMISSIONS = [
  { key: "dashboard", label: "Panel" },
  { key: "clients", label: "Clientes" },
  { key: "inventory", label: "Inventario" },
  { key: "sales", label: "Ventas" },
  { key: "purchases", label: "Compras" },
  { key: "settings", label: "Ajustes" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];
export type Role = "admin" | "employee";

export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key);
export const DEFAULT_EMPLOYEE_PERMISSIONS: Permission[] = ["sales"];

type User = { username: string; name: string; role: Role; permissions: Permission[] };

type AuthCtx = {
  user: User | null;
  users: User[];
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  can: (p: Permission) => boolean;
  isAdmin: boolean;
  addEmployee: (data: { username: string; name: string; password: string; role: Role; permissions: Permission[] }) => Promise<void>;
  updateEmployee: (username: string, patch: { name?: string; password?: string; role?: Role; permissions?: Permission[] }) => Promise<void>;
  removeEmployee: (username: string) => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);
const SESSION_KEY = "lustre_session_v2";

function toPublic(row: Record<string, unknown>): User {
  const role: Role = (row.role as Role) ?? "employee";
  const perms = (row.permissions as Permission[]) ?? (role === "admin" ? ALL_PERMISSIONS : DEFAULT_EMPLOYEE_PERMISSIONS);
  return {
    username: row.username as string,
    name: row.name as string,
    role,
    permissions: role === "admin" ? ALL_PERMISSIONS : perms,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  const refreshUsers = useCallback(async () => {
    const { data } = await supabase.from("users").select("username, name, role, permissions");
    if (data) setUsers(data.map((r) => toPublic(r as Record<string, unknown>)));
  }, []);

  useEffect(() => {
    refreshUsers();
    // Restore session from localStorage
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw) as User;
        if (session?.username) setUser(session);
      }
    } catch { /* ignore */ }
  }, [refreshUsers]);

  const login = useCallback(async (username: string, password: string) => {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .ilike("username", username)
      .eq("password", password)
      .single();
    if (error || !data) throw new Error("Usuario o contraseña inválidos");
    const u = toPublic(data as Record<string, unknown>);
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  const register = useCallback(async (username: string, password: string, name: string) => {
    const { data: existing } = await supabase
      .from("users")
      .select("username")
      .ilike("username", username)
      .single();
    if (existing) throw new Error("Ya existe una cuenta con este nombre de usuario");
    if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
    const { data, error } = await supabase
      .from("users")
      .insert({ username, name, password, role: "admin", permissions: ALL_PERMISSIONS })
      .select()
      .single();
    if (error || !data) throw new Error(error?.message ?? "Error al crear cuenta");
    const u = toPublic(data as Record<string, unknown>);
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u);
    await refreshUsers();
  }, [refreshUsers]);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  const addEmployee = useCallback(async (data: { username: string; name: string; password: string; role: Role; permissions: Permission[] }) => {
    const { data: existing } = await supabase
      .from("users")
      .select("username")
      .ilike("username", data.username)
      .single();
    if (existing) throw new Error("Ya existe una cuenta con este nombre de usuario");
    if (data.password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
    const { error } = await supabase.from("users").insert({
      username: data.username,
      name: data.name,
      password: data.password,
      role: data.role,
      permissions: data.role === "admin" ? ALL_PERMISSIONS : data.permissions,
    });
    if (error) throw new Error(error.message);
    await refreshUsers();
  }, [refreshUsers]);

  const updateEmployee = useCallback(async (username: string, patch: { name?: string; password?: string; role?: Role; permissions?: Permission[] }) => {
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.password) update.password = patch.password;
    if (patch.role) {
      update.role = patch.role;
      update.permissions = patch.role === "admin" ? ALL_PERMISSIONS : (patch.permissions ?? DEFAULT_EMPLOYEE_PERMISSIONS);
    } else if (patch.permissions) {
      update.permissions = patch.permissions;
    }
    const { error } = await supabase.from("users").update(update).ilike("username", username);
    if (error) throw new Error(error.message);
    await refreshUsers();
    // Keep local session in sync if updating self
    setUser((cur) => {
      if (!cur || cur.username.toLowerCase() !== username.toLowerCase()) return cur;
      const next = { ...cur, ...patch };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      return next as User;
    });
  }, [refreshUsers]);

  const removeEmployee = useCallback(async (username: string) => {
    const { error } = await supabase.from("users").delete().ilike("username", username);
    if (error) throw new Error(error.message);
    await refreshUsers();
  }, [refreshUsers]);

  const isAdmin = user?.role === "admin";
  const can = useCallback(
    (p: Permission) => (user ? user.role === "admin" || user.permissions.includes(p) : false),
    [user],
  );

  return (
    <Ctx.Provider value={{ user, users, login, register, logout, can, isAdmin, addEmployee, updateEmployee, removeEmployee }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
