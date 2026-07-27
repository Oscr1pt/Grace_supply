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

type User = { username: string; name: string; role: Role; permissions: Permission[] };

type AuthCtx = {
  user: User | null;
  users: User[];
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  can: (p: Permission) => boolean;
  isAdmin: boolean;
  addEmployee: (data: { username: string; name: string; password: string; role: Role; permissions: Permission[] }) => void;
  updateEmployee: (username: string, patch: { name?: string; password?: string; role?: Role; permissions?: Permission[] }) => void;
  removeEmployee: (username: string) => void;
};

const Ctx = createContext<AuthCtx | null>(null);
const SESSION_KEY = "lustre_session";
const USERS_KEY = "lustre_users";

type StoredUser = { username: string; name: string; password: string; role?: Role; permissions?: Permission[] };

function normalize(u: StoredUser): StoredUser {
  const role: Role = u.role ?? "admin";
  return {
    ...u,
    role,
    permissions: role === "admin" ? ALL_PERMISSIONS : u.permissions ?? DEFAULT_EMPLOYEE_PERMISSIONS,
  };
}

/** Migrate legacy stored records that used `email` instead of `username`. */
function migrateRaw(raw: unknown[]): StoredUser[] {
  return raw.map((r: unknown) => {
    const rec = r as Record<string, unknown>;
    if (!rec.username && rec.email) {
      // Strip the domain part if it looks like an email, otherwise keep as-is
      const email = String(rec.email);
      const atIndex = email.indexOf("@");
      rec.username = atIndex > 0 ? email.slice(0, atIndex) : email;
      delete rec.email;
    }
    return rec as StoredUser;
  });
}

function loadUsers(): StoredUser[] {
  try {
    const raw = JSON.parse(localStorage.getItem(USERS_KEY) || "[]") as unknown[];
    return migrateRaw(raw).map(normalize);
  } catch {
    return [];
  }
}
function saveUsers(u: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(u.map(normalize)));
}
function toPublic(u: StoredUser): User {
  const n = normalize(u);
  return { username: n.username, name: n.name, role: n.role!, permissions: n.permissions! };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  const refreshUsers = useCallback(() => setUsers(loadUsers().map(toPublic)), []);

  useEffect(() => {
    const stored = loadUsers();
    if (stored.length === 0) {
      saveUsers([
        { username: "admin", name: "Demo Owner", password: "demo1234", role: "admin", permissions: ALL_PERMISSIONS },
      ]);
    } else {
      saveUsers(stored); // persist migration
    }
    refreshUsers();

    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw) as { username?: string; email?: string };
        // Support old sessions that stored email
        const id = session.username ?? (session.email ? session.email.split("@")[0] : undefined);
        const found = loadUsers().find((u) => u.username.toLowerCase() === id?.toLowerCase());
        if (found) setUser(toPublic(found));
      }
    } catch {
      // ignore
    }
  }, [refreshUsers]);

  const login = useCallback(async (username: string, password: string) => {
    const found = loadUsers().find(
      (u) => u.username.toLowerCase() === username.toLowerCase() && u.password === password,
    );
    if (!found) throw new Error("Usuario o contraseña inválidos");
    const u = toPublic(found);
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  const register = useCallback(async (username: string, password: string, name: string) => {
    const list = loadUsers();
    if (list.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error("Ya existe una cuenta con este nombre de usuario");
    }
    if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
    const isFirst = list.length === 0;
    const stored: StoredUser = {
      username,
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
    if (list.some((u) => u.username.toLowerCase() === data.username.toLowerCase())) {
      throw new Error("Ya existe una cuenta con este nombre de usuario");
    }
    if (data.password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
    list.push({ ...data });
    saveUsers(list);
    setUsers(loadUsers().map(toPublic));
  }, []);

  const updateEmployee = useCallback<AuthCtx["updateEmployee"]>((username, patch) => {
    const list = loadUsers().map((u) =>
      u.username.toLowerCase() === username.toLowerCase()
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
      if (!cur || cur.username.toLowerCase() !== username.toLowerCase()) return cur;
      const found = loadUsers().find((u) => u.username.toLowerCase() === username.toLowerCase());
      if (!found) return cur;
      const next = toPublic(found);
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeEmployee = useCallback((username: string) => {
    saveUsers(loadUsers().filter((u) => u.username.toLowerCase() !== username.toLowerCase()));
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
