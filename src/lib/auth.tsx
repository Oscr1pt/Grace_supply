import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type User = { email: string; name: string };

type AuthCtx = {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);
const SESSION_KEY = "lustre_session";
const USERS_KEY = "lustre_users";

type StoredUser = { email: string; name: string; password: string };

function loadUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveUsers(u: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(u));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {
      // ignore
    }
    // seed demo user if none exist
    const users = loadUsers();
    if (users.length === 0) {
      saveUsers([{ email: "demo@lustre.co", name: "Demo Owner", password: "demo1234" }]);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const users = loadUsers();
    const found = users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!found) throw new Error("Invalid email or password");
    const u = { email: found.email, name: found.name };
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const users = loadUsers();
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error("An account with this email already exists");
    }
    if (password.length < 6) throw new Error("Password must be at least 6 characters");
    users.push({ email, name, password });
    saveUsers(users);
    const u = { email, name };
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, login, register, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
