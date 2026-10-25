import { Fragment, createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { Session } from "@supabase/supabase-js";
import type { UUID } from "./database.types";
import { clearLegacyLocalSessionAndDataCache, supabase } from "./supabase";
import { initialAuthCallback } from "./authCallback.js";
import { setReadFailure, userPersistenceMessage } from "./persistence.js";
import { createAuthorizationScopeKey } from "./sessionScope.js";

export const PERMISSIONS = [
  { key: "dashboard", label: "Panel" },
  { key: "clients", label: "Clientes" },
  { key: "suppliers", label: "Proveedores" },
  { key: "inventory", label: "Inventario" },
  { key: "sales", label: "Ventas" },
  { key: "purchases", label: "Compras" },
  { key: "expenses", label: "Gastos" },
  { key: "settings", label: "Ajustes" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];
export type Role = "admin" | "employee";
export type User = { username: string; name: string; role: Role; permissions: Permission[]; active: boolean; authUserId?: string };

export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((permission) => permission.key);
export const DEFAULT_EMPLOYEE_PERMISSIONS: Permission[] = ["sales"];

type AuthCtx = {
  user: User | null;
  users: User[];
  authReady: boolean;
  passwordSetupStatus: "none" | "pending" | "ready" | "error" | "complete";
  passwordSetupError: string | null;
  completePasswordSetup: () => void;
  scopeKey: string;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
  isAdmin: boolean;
  updateEmployee: (username: string, patch: { name?: string; role?: Role; permissions?: Permission[] }) => Promise<void>;
  removeEmployee: (username: string) => Promise<void>;
  inviteEmployee: (input: { username: string; name: string; email: string }) => Promise<void>;
  activateEmployee: (username: string) => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);
const INVALID_CREDENTIALS = "Usuario o contraseña inválidos";
const AUTH_UNAVAILABLE = "No se pudo verificar la sesión. Intenta de nuevo.";

type ProfileRow = {
  username: string;
  name: string;
  role: Role;
  permissions: string[];
  active: boolean;
};

function toPublic(row: ProfileRow, authUserId?: string): User {
  const role: Role = row.role === "admin" ? "admin" : "employee";
  const permissions = row.permissions.filter((permission): permission is Permission =>
    ALL_PERMISSIONS.includes(permission as Permission)
  );
  return { username: row.username, name: row.name, role, permissions: role === "admin" ? ALL_PERMISSIONS : permissions, active: row.active, authUserId };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [authReady, setAuthReady] = useState(false);
  // Keep the server render and the browser's first render identical. Callback
  // state is derived after hydration so SSR cannot disagree with window.location.
  const [passwordSetupStatus, setPasswordSetupStatus] = useState<"none" | "pending" | "ready" | "error" | "complete">("none");
  const [passwordSetupError, setPasswordSetupError] = useState<string | null>(null);
  const [cacheGeneration, setCacheGeneration] = useState(0);
  const currentIdentity = useRef<string | null>(null);
  const currentAuthorizationKey = useRef("anonymous");
  const authRevision = useRef(0);
  const initializedAuth = useRef(false);
  const invalidationChannel = useRef<BroadcastChannel | null>(null);
  const passwordSetupIdentity = useRef<string | null>(null);

  const loadCurrentProfile = useCallback(async () => {
    const { data: authResult, error: authError } = await supabase.auth.getUser();
    if (authError || !authResult.user?.email_confirmed_at) return null;

    const { data, error } = await supabase
      .from("user_profiles")
      .select("username, name, role, permissions, active")
      .eq("auth_user_id", authResult.user.id as UUID)
      .maybeSingle();
    if (error || !data?.active) return null;
    return toPublic(data as ProfileRow, authResult.user.id);
  }, []);

  const refreshUsers = useCallback(async () => {
    const revision = authRevision.current;
    const { data, error } = await supabase
      .from("user_profiles")
      .select("username, name, role, permissions, active")
      .order("username");
    if (error) {
      if (revision !== authRevision.current) return;
      setReadFailure("user_profiles", userPersistenceMessage(error));
      return;
    }
    if (revision !== authRevision.current) return;
    setUsers((data ?? []).map((profile) => toPublic(profile as ProfileRow)));
    setReadFailure("user_profiles", null);
  }, []);

  const announceInvalidation = useCallback(() => {
    try {
      invalidationChannel.current?.postMessage({ type: "invalidate-private-state" });
    } catch {
      // Cross-tab messaging is a hint; each tab still validates its own Auth session and RLS access.
    }
  }, []);

  const acceptSession = useCallback(async (session: Session | null, revision: number, announce = false) => {
    setAuthReady(false);
    if (!session) {
      const changed = !initializedAuth.current || currentIdentity.current !== null;
      if (changed) clearLegacyLocalSessionAndDataCache();
      currentIdentity.current = null;
      currentAuthorizationKey.current = "anonymous";
      initializedAuth.current = true;
      if (changed) setCacheGeneration((generation) => generation + 1);
      if (revision !== authRevision.current) return;
      setUser(null);
      setUsers([]);
      setAuthReady(true);
      if (announce && changed) announceInvalidation();
      return;
    }

    const profile = await loadCurrentProfile();
    if (revision !== authRevision.current) return;
    if (!profile) {
      const { data: currentSession } = await supabase.auth.getSession();
      if (revision !== authRevision.current || currentSession.session?.user.id !== session.user.id) return;
      if (passwordSetupIdentity.current === session.user.id) {
        const changed = !initializedAuth.current || currentIdentity.current !== null;
        if (changed) {
          clearLegacyLocalSessionAndDataCache();
          setCacheGeneration((generation) => generation + 1);
        }
        currentIdentity.current = null;
        currentAuthorizationKey.current = "anonymous";
        initializedAuth.current = true;
        setUser(null);
        setUsers([]);
        setAuthReady(true);
        return;
      }
      await supabase.auth.signOut({ scope: "local" });
      return;
    }
    if (profile.authUserId !== session.user.id) return;
    const nextAuthorizationKey = createAuthorizationScopeKey(profile);
    const changed = !initializedAuth.current || currentAuthorizationKey.current !== nextAuthorizationKey;
    if (changed) {
      clearLegacyLocalSessionAndDataCache();
      setCacheGeneration((generation) => generation + 1);
    }
    currentIdentity.current = profile?.authUserId ?? null;
    currentAuthorizationKey.current = nextAuthorizationKey;
    initializedAuth.current = true;
    setUser(profile);
    setAuthReady(true);
    if (announce && changed) announceInvalidation();
  }, [announceInvalidation, loadCurrentProfile]);

  const revalidateSession = useCallback(async (invalidateImmediately = false) => {
    const revision = ++authRevision.current;
    if (invalidateImmediately) setCacheGeneration((generation) => generation + 1);
    setAuthReady(false);
    const { data, error } = await supabase.auth.getSession();
    if (revision !== authRevision.current) return;
    if (error) {
      clearLegacyLocalSessionAndDataCache();
      currentIdentity.current = null;
      currentAuthorizationKey.current = "anonymous";
      setUser(null);
      setUsers([]);
      setCacheGeneration((generation) => generation + 1);
      setAuthReady(true);
      await supabase.auth.signOut({ scope: "local" });
      return;
    }
    await acceptSession(data.session, revision);
  }, [acceptSession]);

  useEffect(() => {
    if (initialAuthCallback.present) {
      setPasswordSetupError(initialAuthCallback.hasError ? "El enlace venció, ya fue utilizado o no es válido." : null);
      setPasswordSetupStatus(initialAuthCallback.hasError ? "error" : "pending");
    }
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      const isVerifiedCallbackSession = event === "SIGNED_IN" || event === "PASSWORD_RECOVERY" || (
        event === "INITIAL_SESSION" && initialAuthCallback.present && !initialAuthCallback.hasError
      );
      if (initialAuthCallback.present && !initialAuthCallback.hasError && session?.user && isVerifiedCallbackSession) {
        passwordSetupIdentity.current = session.user.id;
      }
      const revision = ++authRevision.current;
      // Do not start another Supabase Auth request in the callback's microtask
      // queue: auth-js may still hold its internal lock until this callback
      // returns. Deferring one task keeps getUser/getSession from blocking the
      // next updateUser call on password-recovery callbacks.
      window.setTimeout(() => {
        void (async () => {
          await acceptSession(session, revision, true);
          if (
            revision === authRevision.current && isVerifiedCallbackSession &&
            initialAuthCallback.present && !initialAuthCallback.hasError &&
            session?.user && passwordSetupIdentity.current === session.user.id
          ) {
            setPasswordSetupError(null);
            setPasswordSetupStatus("ready");
          }
        })();
      }, 0);
    });
    const initialRevision = authRevision.current;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (initialRevision !== authRevision.current) return;
      if (error) {
        void acceptSession(null, initialRevision);
        if (initialAuthCallback.present && !initialAuthCallback.hasError && !passwordSetupIdentity.current) {
          setPasswordSetupError("El enlace venció, ya fue utilizado o no es válido.");
          setPasswordSetupStatus("error");
        }
        return;
      }
      if (initialAuthCallback.present && !initialAuthCallback.hasError && !passwordSetupIdentity.current) {
        setPasswordSetupError("El enlace venció, ya fue utilizado o no es válido.");
        setPasswordSetupStatus("error");
      }
      void acceptSession(data.session, initialRevision);
    });
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [acceptSession]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("grace-supply-session-invalidation");
    invalidationChannel.current = channel;
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (
        typeof event.data === "object" && event.data !== null &&
        "type" in event.data && event.data.type === "invalidate-private-state"
      ) void revalidateSession(true);
    };
    return () => {
      channel.close();
      if (invalidationChannel.current === channel) invalidationChannel.current = null;
    };
  }, [revalidateSession]);

  useEffect(() => {
    if (user?.role === "admin") void refreshUsers();
    else setUsers([]);
  }, [user, refreshUsers]);

  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === "visible") void revalidateSession(true);
    };
    document.addEventListener("visibilitychange", revalidate);
    return () => document.removeEventListener("visibilitychange", revalidate);
  }, [revalidateSession]);

  const authorizationKey = createAuthorizationScopeKey(user);
  const scopeKey = `${authorizationKey}:${cacheGeneration}`;

  useEffect(() => {
    queryClient.clear();
    void router.invalidate();
  }, [queryClient, router, scopeKey]);

  const login = useCallback(async (username: string, password: string) => {
    const { data, error } = await supabase.functions.invoke<{ session: Session }>("username-login", {
      body: { username, password },
    });
    if (error) {
      const status = (error as { context?: Response }).context?.status;
      if (status === 401) throw new Error(INVALID_CREDENTIALS);
      throw new Error("El servicio de inicio de sesión no está disponible.");
    }
    if (!data?.session?.access_token || !data.session.refresh_token) throw new Error(INVALID_CREDENTIALS);

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (sessionError) throw new Error(AUTH_UNAVAILABLE);
    const loginRevision = authRevision.current;
    const profile = await loadCurrentProfile();
    const expectedIdentity = data.session.user?.id;
    if (loginRevision !== authRevision.current) throw new Error(AUTH_UNAVAILABLE);
    if (!profile || (expectedIdentity && profile.authUserId !== expectedIdentity)) {
      const { data: currentSession } = await supabase.auth.getSession();
      if (expectedIdentity && currentSession.session?.user.id === expectedIdentity) {
        await supabase.auth.signOut({ scope: "local" });
      }
      throw new Error(INVALID_CREDENTIALS);
    }
    const nextAuthorizationKey = createAuthorizationScopeKey(profile);
    if (!initializedAuth.current || currentAuthorizationKey.current !== nextAuthorizationKey) {
      clearLegacyLocalSessionAndDataCache();
      setCacheGeneration((generation) => generation + 1);
    }
    authRevision.current += 1;
    currentAuthorizationKey.current = nextAuthorizationKey;
    currentIdentity.current = profile.authUserId ?? null;
    initializedAuth.current = true;
    setUser(profile);
    setAuthReady(true);
    announceInvalidation();
  }, [announceInvalidation, loadCurrentProfile]);

  const logout = useCallback(async () => {
    authRevision.current += 1;
    clearLegacyLocalSessionAndDataCache();
    currentIdentity.current = null;
    currentAuthorizationKey.current = "anonymous";
    initializedAuth.current = true;
    setCacheGeneration((generation) => generation + 1);
    setUser(null);
    setUsers([]);
    setAuthReady(true);
    announceInvalidation();
    await supabase.auth.signOut({ scope: "local" });
  }, [announceInvalidation]);

  const updateEmployee = useCallback(async (username: string, patch: { name?: string; role?: Role; permissions?: Permission[] }) => {
    const { error } = await supabase.functions.invoke("manage-profile", {
      body: { action: "update", username, ...patch },
    });
    if (error) throw new Error(userPersistenceMessage(error));
    await refreshUsers();
    announceInvalidation();
    if (username === user?.username) await revalidateSession(true);
  }, [announceInvalidation, refreshUsers, revalidateSession, user?.username]);

  const removeEmployee = useCallback(async (username: string) => {
    const { error } = await supabase.functions.invoke("manage-profile", {
      body: { action: "revoke", username },
    });
    if (error) throw new Error(userPersistenceMessage(error));
    await refreshUsers();
    announceInvalidation();
    if (username === user?.username) await revalidateSession(true);
  }, [announceInvalidation, refreshUsers, revalidateSession, user?.username]);

  const inviteEmployee = useCallback(async (input: { username: string; name: string; email: string }) => {
    const { error } = await supabase.functions.invoke("manage-profile", {
      body: { action: "invite_employee", ...input, permissions: DEFAULT_EMPLOYEE_PERMISSIONS },
    });
    if (error) throw new Error(userPersistenceMessage(error));
    await refreshUsers();
    announceInvalidation();
  }, [announceInvalidation, refreshUsers]);

  const activateEmployee = useCallback(async (username: string) => {
    const { error } = await supabase.functions.invoke("manage-profile", {
      body: { action: "activate", username },
    });
    if (error) throw new Error(userPersistenceMessage(error));
    await refreshUsers();
    announceInvalidation();
  }, [announceInvalidation, refreshUsers]);

  const isAdmin = user?.role === "admin";
  const completePasswordSetup = useCallback(() => {
    setPasswordSetupError(null);
    setPasswordSetupStatus("complete");
  }, []);
  const can = useCallback(
    (permission: Permission) => Boolean(user && (user.role === "admin" || user.permissions.includes(permission))),
    [user],
  );

  return (
    <Ctx.Provider value={{ user, users, authReady, passwordSetupStatus, passwordSetupError, completePasswordSetup, scopeKey, login, logout, can, isAdmin, updateEmployee, removeEmployee, inviteEmployee, activateEmployee }}>
      <Fragment key={scopeKey}>{children}</Fragment>
    </Ctx.Provider>
  );
}

export function useAuth() {
  const context = useContext(Ctx);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
