import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

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

type User = { email: string; name: string; role: Role; permissions: Permission[] };

type AuthCtx = {
  user: User | null;
  users: User[];
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  can: (p: Permission) => boolean;
  isAdmin: boolean;
  addEmployee: (data: { email: string; name: string; password: string; role: Role; permissions: Permission[] }) => void;
  updateEmployee: (email: string, patch: { name?: string; password?: string; role?: Role; permissions?: Permission[] }) => void;
  removeEmployee: (email: string) => void;
};

const Ctx = createContext<AuthCtx | null>(null);
const SESSION_KEY = "lustre_session";
const USERS_KEY = "lustre_users";

type StoredUser = { email: string; name: string; password: string; role?: Role; permissions?: Permission[] };

function normalize(u: StoredUser): StoredUser {
  const role: Role = u.role ?? "admin";
  return {
    ...u,
    role,
    permissions: role === "admin" ? ALL_PERMISSIONS : u.permissions ?? DEFAULT_EMPLOYEE_PERMISSIONS,
  };
}

function loadUsers(): StoredUser[] {
  try {
    const raw = JSON.parse(localStorage.getItem(USERS_KEY) || "[]") as StoredUser[];
    return raw.map(normalize);
  } catch {
    return [];
  }
}
function saveUsers(u: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(u.map(normalize)));
}
function toPublic(u: StoredUser): User {
  const n = normalize(u);
  return { email: n.email, name: n.name, role: n.role!, permissions: n.permissions! };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  const refreshUsers = useCallback(() => setUsers(loadUsers().map(toPublic)), []);

  useEffect(() => {
    const stored = loadUsers();
    if (stored.length === 0) {
      saveUsers([
        { email: "demo@lustre.co", name: "Demo Owner", password: "demo1234", role: "admin", permissions: ALL_PERMISSIONS },
      ]);
    } else {
      saveUsers(stored); // migrate legacy accounts to admin
    }
    refreshUsers();

    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw) as { email: string };
        const found = loadUsers().find((u) => u.email.toLowerCase() === session.email?.toLowerCase());
        if (found) setUser(toPublic(found));
      }
    } catch {
      // ignore
    }
  }, [refreshUsers]);

  const login = useCallback(async (email: string, password: string) => {
    const found = loadUsers().find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
    );
    if (!found) throw new Error("Correo o contraseña inválidos");
    const u = toPublic(found);
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const list = loadUsers();
    if (list.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error("Ya existe una cuenta con este correo");
    }
    if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
    const isFirst = list.length === 0;
    const stored: StoredUser = {
      email,
      name,
      password,
      role: isFirst ? "admin" : "admin",
      permissions: ALL_PERMISSIONS,
    };
    list.push(stored);
    saveUsers(list);
    const u = toPublic(stored);
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u);
    setUsers(loadUsers().map(toPublic));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  const addEmployee = useCallback<AuthCtx["addEmployee"]>((data) => {
    const list = loadUsers();
    if (list.some((u) => u.email.toLowerCase() === data.email.toLowerCase())) {
      throw new Error("Ya existe una cuenta con este correo");
    }
    if (data.password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
    list.push({ ...data });
    saveUsers(list);
    setUsers(loadUsers().map(toPublic));
  }, []);

  const updateEmployee = useCallback<AuthCtx["updateEmployee"]>((email, patch) => {
    const list = loadUsers().map((u) =>
      u.email.toLowerCase() === email.toLowerCase()
        ? {
            ...u,
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.password ? { password: patch.password } : {}),
            ...(patch.role ? { role: patch.role } : {}),
            ...(patch.permissions ? { permissions: patch.permissions } : {}),
          }
        : u,
    );
    saveUsers(list);
    setUsers(loadUsers().map(toPublic));
    setUser((cur) => {
      if (!cur || cur.email.toLowerCase() !== email.toLowerCase()) return cur;
      const found = loadUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (!found) return cur;
      const next = toPublic(found);
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeEmployee = useCallback((email: string) => {
    saveUsers(loadUsers().filter((u) => u.email.toLowerCase() !== email.toLowerCase()));
    setUsers(loadUsers().map(toPublic));
  }, []);

  const isAdmin = user?.role === "admin";
  const can = useCallback(
    (p: Permission) => (user ? user.role === "admin" || user.permissions.includes(p) : false),
    [user],
  );

  return (
    <Ctx.Provider
      value={{ user, users, login, register, logout, can, isAdmin, addEmployee, updateEmployee, removeEmployee }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
