import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { Session } from "@supabase/supabase-js";
import type { UUID } from "./database.types";
import { clearLegacyLocalSessionAndDataCache, supabase } from "./supabase";
import { initialAuthCallback } from "./authCallback.js";
import { setReadFailure, userPersistenceMessage } from "./persistence.js";
import { createAuthorizationScopeKey } from "./sessionScope.js";
import {
  IDLE_EXPIRE_AFTER_MS,
  IDLE_WARNING_AFTER_MS,
  IDLE_WARNING_TICK_MS,
  IdleSessionClock,
  clearIdleActivity,
  clearIdleExpiry,
  formatIdleRemaining,
  idleActivityStorageKey,
  idleExpiryStorageKey,
  isIdleExpiryPersisted,
  isTrustedIdleActivity,
  persistIdleActivity,
  persistIdleExpiry,
  restoreIdleActivity,
} from "./idleSession.js";
import {
  employeeActionErrorMessage,
  requireConfirmedEmployeeProfile,
} from "./employeeManagement.js";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
export type User = {
  username: string;
  name: string;
  phone: string | null;
  role: Role;
  permissions: Permission[];
  active: boolean;
  passwordChangeRequired?: boolean;
  emailConfirmed?: boolean | null;
  authUserId?: string;
};
type UserListStatus = "loading" | "ready" | "error";

export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((permission) => permission.key);
export const DEFAULT_EMPLOYEE_PERMISSIONS: Permission[] = ["sales"];

type AuthCtx = {
  user: User | null;
  users: User[];
  usersStatus: UserListStatus;
  usersError: string | null;
  refreshUsers: () => Promise<boolean>;
  authReady: boolean;
  passwordSetupStatus: "none" | "pending" | "ready" | "error" | "complete";
  passwordSetupError: string | null;
  completePasswordSetup: () => void;
  cancelPasswordSetup: () => Promise<void>;
  scopeKey: string;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
  isAdmin: boolean;
  updateEmployee: (
    username: string,
    patch: { name?: string; phone?: string | null; role?: Role; permissions?: Permission[] },
  ) => Promise<void>;
  createEmployee: (input: {
    username: string;
    name: string;
    email: string;
    phone: string;
    role: Role;
    confirmAdminCreation?: boolean;
  }) => Promise<{ setupUrl: string }>;
  removeEmployee: (username: string) => Promise<void>;
  activateEmployee: (username: string) => Promise<void>;
  createEmployeeRecoveryLink: (username: string) => Promise<string>;
  idleExpiryMessage: string | null;
};

const Ctx = createContext<AuthCtx | null>(null);
const INVALID_CREDENTIALS = "Usuario o contraseña inválidos";
const AUTH_UNAVAILABLE = "No se pudo verificar la sesión. Intenta de nuevo.";

class ProfileLoadError extends Error {
  constructor(readonly status: number | null = null) {
    super(AUTH_UNAVAILABLE);
    this.name = "ProfileLoadError";
  }
}

type ProfileRow = {
  username: string;
  name: string;
  phone: string | null;
  role: Role;
  permissions: string[];
  active: boolean;
  password_change_required?: boolean;
  email_confirmed?: boolean | null;
};

function toPublic(row: ProfileRow, authUserId?: string): User {
  const role: Role = row.role === "admin" ? "admin" : "employee";
  const permissions = row.permissions.filter((permission): permission is Permission =>
    ALL_PERMISSIONS.includes(permission as Permission),
  );
  return {
    username: row.username,
    name: row.name,
    phone: row.phone ?? null,
    role,
    permissions: role === "admin" ? ALL_PERMISSIONS : permissions,
    active: row.active,
    passwordChangeRequired: row.password_change_required === true,
    emailConfirmed: typeof row.email_confirmed === "boolean" ? row.email_confirmed : null,
    authUserId,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [usersStatus, setUsersStatus] = useState<UserListStatus>("loading");
  const [usersError, setUsersError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [idleWarningOpen, setIdleWarningOpen] = useState(false);
  const [idleRemaining, setIdleRemaining] = useState("5:00");
  const [idleExpiryMessage, setIdleExpiryMessage] = useState<string | null>(null);
  // Keep the server render and the browser's first render identical. Callback
  // state is derived after hydration so SSR cannot disagree with window.location.
  const [passwordSetupStatus, setPasswordSetupStatus] = useState<
    "none" | "pending" | "ready" | "error" | "complete"
  >("none");
  const [passwordSetupError, setPasswordSetupError] = useState<string | null>(null);
  const [cacheGeneration, setCacheGeneration] = useState(0);
  const currentIdentity = useRef<string | null>(null);
  const currentAuthorizationKey = useRef("anonymous");
  const authRevision = useRef(0);
  const loginAttempt = useRef(0);
  const initializedAuth = useRef(false);
  const invalidationChannel = useRef<BroadcastChannel | null>(null);
  const passwordSetupIdentity = useRef<string | null>(null);
  const passwordSetupFlowActive = useRef(false);
  const idleLocked = useRef(false);
  const observedIdleIdentity = useRef<string | null>(null);
  const idleContinueHandler = useRef<(() => void) | null>(null);

  const blockIdleIdentity = useCallback(
    (identity: string) => {
      if (idleLocked.current) return;
      // Lock and remove private UI state synchronously, before network logout.
      idleLocked.current = true;
      loginAttempt.current += 1;
      authRevision.current += 1;
      setIdleWarningOpen(false);
      setAuthReady(true);
      setIdleExpiryMessage(
        "El acceso privado quedó bloqueado por inactividad. Inicia sesión nuevamente.",
      );
      clearLegacyLocalSessionAndDataCache();
      currentIdentity.current = null;
      currentAuthorizationKey.current = "anonymous";
      initializedAuth.current = true;
      setCacheGeneration((generation) => generation + 1);
      setUser(null);
      setUsers([]);
      queryClient.clear();
      try {
        const storage = window.sessionStorage;
        persistIdleExpiry(storage, idleExpiryStorageKey(identity));
        clearIdleActivity(storage, idleActivityStorageKey(identity));
      } catch {
        // The in-memory lock remains authoritative if tab storage is unavailable.
      }
      void router.navigate({ to: "/login", replace: true }).catch(() => undefined);
      void supabase.auth
        .signOut({ scope: "local" })
        .then(({ error }) => {
          setIdleExpiryMessage(
            error
              ? "El acceso privado quedó bloqueado por inactividad, pero no se pudo confirmar el cierre local. Inicia sesión nuevamente cuando haya conexión."
              : "Tu sesión se cerró por inactividad. Inicia sesión nuevamente",
          );
        })
        .catch(() => {
          setIdleExpiryMessage(
            "El acceso privado quedó bloqueado por inactividad, pero no se pudo confirmar el cierre local. Inicia sesión nuevamente cuando haya conexión.",
          );
        });
    },
    [queryClient, router],
  );

  const loadCurrentProfile = useCallback(async () => {
    const { data: authResult, error: authError } = await supabase.auth.getUser();
    if (authError) {
      const status = typeof authError.status === "number" ? authError.status : null;
      throw new ProfileLoadError(status);
    }
    if (!authResult.user?.email_confirmed_at) return null;

    const { data, error } = await supabase
      .from("user_profiles")
      .select("username, name, phone, role, permissions, active, password_change_required")
      .eq("auth_user_id", authResult.user.id as UUID)
      .maybeSingle();
    if (error) throw new ProfileLoadError();
    if (!data?.active) return null;
    return toPublic(data as ProfileRow, authResult.user.id);
  }, []);

  const refreshUsers = useCallback(async () => {
    const revision = authRevision.current;
    setUsersStatus("loading");
    setUsersError(null);
    const { data, error } = await supabase.functions.invoke<{ profiles?: ProfileRow[] }>(
      "manage-profile",
      { body: { action: "list_employees" } },
    );
    if (error || !Array.isArray(data?.profiles)) {
      if (revision !== authRevision.current) return false;
      const message = error
        ? employeeActionErrorMessage(error, "list")
        : "No se pudo confirmar la lista de empleados. Actualízala antes de continuar.";
      setReadFailure("user_profiles", message);
      setUsersError(message);
      setUsersStatus("error");
      return false;
    }
    if (revision !== authRevision.current) return false;
    setUsers(data.profiles.map((profile) => toPublic(profile)));
    setUsersStatus("ready");
    setReadFailure("user_profiles", null);
    return true;
  }, []);

  const announceInvalidation = useCallback(() => {
    try {
      invalidationChannel.current?.postMessage({ type: "invalidate-private-state" });
    } catch {
      // Cross-tab messaging is a hint; each tab still validates its own Auth session and RLS access.
    }
  }, []);

  const acceptSession = useCallback(
    async (
      session: Session | null,
      revision: number,
      announce = false,
      checkPersistedExpiry = false,
    ) => {
      if (revision !== authRevision.current) return;
      let persistedExpiry = false;
      try {
        persistedExpiry = Boolean(
          session &&
          checkPersistedExpiry &&
          isIdleExpiryPersisted(window.sessionStorage, idleExpiryStorageKey(session.user.id)),
        );
      } catch {
        persistedExpiry = Boolean(session && checkPersistedExpiry);
      }
      if (session && checkPersistedExpiry && !persistedExpiry) {
        const identity = session.user.id;
        if (currentIdentity.current === identity || currentIdentity.current === null) {
          const restored = restoreIdleActivity(
            window.sessionStorage,
            idleActivityStorageKey(identity),
            Date.now(),
          );
          persistedExpiry =
            restored.invalid || Date.now() - restored.lastActivityAt >= IDLE_EXPIRE_AFTER_MS;
        }
      }
      if (session && persistedExpiry) {
        idleLocked.current = true;
        loginAttempt.current += 1;
        authRevision.current += 1;
        setAuthReady(true);
        currentIdentity.current = null;
        currentAuthorizationKey.current = "anonymous";
        initializedAuth.current = true;
        setUser(null);
        setUsers([]);
        setCacheGeneration((generation) => generation + 1);
        queryClient.clear();
        setIdleExpiryMessage(
          "El acceso privado quedó bloqueado por inactividad. Inicia sesión nuevamente.",
        );
        void router.navigate({ to: "/login", replace: true }).catch(() => undefined);
        void supabase.auth
          .signOut({ scope: "local" })
          .then(({ error }) => {
            if (error) {
              setIdleExpiryMessage(
                "El acceso privado quedó bloqueado por inactividad, pero no se pudo confirmar el cierre local. Inicia sesión nuevamente cuando haya conexión.",
              );
            } else {
              setIdleExpiryMessage("Tu sesión se cerró por inactividad. Inicia sesión nuevamente");
            }
          })
          .catch(() => {
            setIdleExpiryMessage(
              "El acceso privado quedó bloqueado por inactividad, pero no se pudo confirmar el cierre local. Inicia sesión nuevamente cuando haya conexión.",
            );
          });
        return;
      }
      // A late INITIAL_SESSION, refresh, or profile response cannot reopen a tab
      // that has already crossed its local idle-expiry boundary. Only an
      // explicit login verified below may clear idleLocked.
      if (idleLocked.current && session) return;
      setAuthReady(false);
      if (!session) {
        setIdleWarningOpen(false);
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

      let profile: User | null;
      try {
        profile = await loadCurrentProfile();
      } catch (error) {
        // During invitation/recovery setup the profile is intentionally
        // inactive, so RLS may reject its private profile read. The Auth
        // callback identity is still sufficient to finish password setup;
        // do not turn that expected denial into an expired-link state.
        if (passwordSetupFlowActive.current && passwordSetupIdentity.current === session.user.id) {
          if (revision === authRevision.current) setAuthReady(true);
          return;
        }
        if (revision !== authRevision.current) return;
        if (error instanceof ProfileLoadError && (error.status === 401 || error.status === 403)) {
          // A revoked/invalid identity must not retain private React or query state.
          // Invalidate any login that is still waiting on an older profile response.
          loginAttempt.current += 1;
          const changed = currentIdentity.current !== null;
          clearLegacyLocalSessionAndDataCache();
          currentIdentity.current = null;
          currentAuthorizationKey.current = "anonymous";
          initializedAuth.current = true;
          setCacheGeneration((generation) => generation + 1);
          setUser(null);
          setUsers([]);
          queryClient.clear();
          setAuthReady(true);
          void supabase.auth.signOut({ scope: "local" });
          if (changed) announceInvalidation();
          return;
        }
        setAuthReady(true);
        return;
      }
      if (revision !== authRevision.current) return;
      if (!profile) {
        const { data: currentSession } = await supabase.auth.getSession();
        if (
          revision !== authRevision.current ||
          currentSession.session?.user.id !== session.user.id
        )
          return;
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
      const changed =
        !initializedAuth.current || currentAuthorizationKey.current !== nextAuthorizationKey;
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
    },
    [announceInvalidation, loadCurrentProfile, queryClient, router],
  );

  const revalidateSession = useCallback(
    async (invalidateImmediately = false) => {
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
      await acceptSession(data.session, revision, false, true);
    },
    [acceptSession],
  );

  useEffect(() => {
    if (initialAuthCallback.present) {
      passwordSetupFlowActive.current = true;
      setPasswordSetupError(
        initialAuthCallback.errorCode === "user_banned"
          ? "La cuenta está revocada o bloqueada. Un administrador debe reactivar el acceso antes de cambiar la contraseña."
          : initialAuthCallback.hasError
            ? "El enlace venció, ya fue utilizado o no es válido."
            : null,
      );
      setPasswordSetupStatus(initialAuthCallback.hasError ? "error" : "pending");
    }
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      const isVerifiedCallbackSession =
        event === "SIGNED_IN" ||
        event === "PASSWORD_RECOVERY" ||
        (event === "INITIAL_SESSION" &&
          passwordSetupFlowActive.current &&
          !initialAuthCallback.hasError);
      if (
        passwordSetupFlowActive.current &&
        !initialAuthCallback.hasError &&
        session?.user &&
        isVerifiedCallbackSession
      ) {
        passwordSetupIdentity.current = session.user.id;
      }
      const revision = ++authRevision.current;
      // Do not start another Supabase Auth request in the callback's microtask
      // queue: auth-js may still hold its internal lock until this callback
      // returns. Deferring one task keeps getUser/getSession from blocking the
      // next updateUser call on password-recovery callbacks.
      window.setTimeout(() => {
        void (async () => {
          await acceptSession(session, revision, true, event === "INITIAL_SESSION");
          if (
            revision === authRevision.current &&
            isVerifiedCallbackSession &&
            passwordSetupFlowActive.current &&
            !initialAuthCallback.hasError &&
            session?.user &&
            passwordSetupIdentity.current === session.user.id
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
      if (passwordSetupFlowActive.current && !initialAuthCallback.hasError && data.session?.user) {
        // A verified invite can arrive through INITIAL_SESSION before the
        // auth-state listener callback. Record the temporary identity here so
        // an inactive profile (expected during setup) is not mistaken for an
        // expired or invalid link.
        passwordSetupIdentity.current = data.session.user.id;
      }
      if (error) {
        void acceptSession(null, initialRevision);
        if (
          passwordSetupFlowActive.current &&
          !initialAuthCallback.hasError &&
          !passwordSetupIdentity.current
        ) {
          setPasswordSetupError("El enlace venció, ya fue utilizado o no es válido.");
          setPasswordSetupStatus("error");
        }
        return;
      }
      // A valid hash callback can report no session on the first getSession
      // tick while auth-js is still exchanging it. Let the auth-state event
      // decide readiness; only explicit getSession errors mark the link bad.
      void acceptSession(data.session, initialRevision, false, true);
      if (
        passwordSetupFlowActive.current &&
        !initialAuthCallback.hasError &&
        data.session?.user &&
        passwordSetupIdentity.current === data.session.user.id
      ) {
        setPasswordSetupError(null);
        setPasswordSetupStatus("ready");
      }
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
        typeof event.data === "object" &&
        event.data !== null &&
        "type" in event.data &&
        event.data.type === "invalidate-private-state"
      )
        void revalidateSession(true);
    };
    return () => {
      channel.close();
      if (invalidationChannel.current === channel) invalidationChannel.current = null;
    };
  }, [revalidateSession]);

  useEffect(() => {
    if (user?.role === "admin") void refreshUsers();
    else {
      setUsers([]);
      setUsersError(null);
      setUsersStatus("ready");
    }
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

  const login = useCallback(
    async (username: string, password: string) => {
      const attempt = ++loginAttempt.current;
      const { data, error } = await supabase.functions.invoke<{ session: Session }>(
        "username-login",
        {
          body: { username, password },
        },
      );
      if (error) {
        const status = (error as { context?: Response }).context?.status;
        if (status === 401) throw new Error(INVALID_CREDENTIALS);
        throw new Error("El servicio de inicio de sesión no está disponible.");
      }
      if (!data?.session?.access_token || !data.session.refresh_token)
        throw new Error(INVALID_CREDENTIALS);

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (sessionError) throw new Error(AUTH_UNAVAILABLE);
      let profile: User | null;
      try {
        profile = await loadCurrentProfile();
      } catch {
        if (attempt === loginAttempt.current) await supabase.auth.signOut({ scope: "local" });
        throw new Error(AUTH_UNAVAILABLE);
      }
      const expectedIdentity = data.session.user?.id;
      if (attempt !== loginAttempt.current) throw new Error(AUTH_UNAVAILABLE);
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
      idleLocked.current = false;
      setIdleWarningOpen(false);
      setIdleExpiryMessage(null);
      try {
        const activityKey = idleActivityStorageKey(profile.authUserId ?? "");
        persistIdleActivity(window.sessionStorage, activityKey, Date.now());
        clearIdleExpiry(window.sessionStorage, idleExpiryStorageKey(profile.authUserId ?? ""));
      } catch {
        // The fresh in-memory timer still applies for this page lifetime.
      }
      currentAuthorizationKey.current = nextAuthorizationKey;
      currentIdentity.current = profile.authUserId ?? null;
      initializedAuth.current = true;
      setUser(profile);
      setAuthReady(true);
      announceInvalidation();
    },
    [announceInvalidation, loadCurrentProfile],
  );

  const logout = useCallback(async () => {
    const identity = currentIdentity.current;
    loginAttempt.current += 1;
    authRevision.current += 1;
    idleLocked.current = false;
    if (identity) {
      try {
        clearIdleActivity(window.sessionStorage, idleActivityStorageKey(identity));
        clearIdleExpiry(window.sessionStorage, idleExpiryStorageKey(identity));
      } catch {
        // Storage cleanup is best-effort; local Auth sign-out remains authoritative.
      }
    }
    setIdleWarningOpen(false);
    setIdleExpiryMessage(null);
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

  useEffect(() => {
    const identity = user?.authUserId;
    if (!identity || !authReady || idleLocked.current || passwordSetupStatus !== "none") return;

    let storage: Storage | null = null;
    let key: string;
    try {
      storage = window.sessionStorage;
      key = idleActivityStorageKey(identity);
    } catch {
      key = idleActivityStorageKey(identity);
    }

    const wallNow = () => Date.now();
    const monotonicNow = () => performance.now();
    const isIdentitySwitch =
      observedIdleIdentity.current !== null && observedIdleIdentity.current !== identity;
    observedIdleIdentity.current = identity;
    const now = wallNow();
    const restored =
      isIdentitySwitch || !storage
        ? { lastActivityAt: now, invalid: false }
        : restoreIdleActivity(storage, key, now);
    if (isIdentitySwitch || restored.invalid) {
      if (storage) persistIdleActivity(storage, key, restored.lastActivityAt);
    }
    const clock = new IdleSessionClock({
      lastActivityAt: restored.lastActivityAt,
      wallNow,
      monotonicNow,
    });
    let timer: number | undefined;
    let disposed = false;
    let lastHandledActivity = Number.NEGATIVE_INFINITY;

    const clearTimer = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };
    const update = () => {
      if (disposed || idleLocked.current) return;
      clearTimer();
      const state = clock.state();
      if (state.phase === "expired") {
        blockIdleIdentity(identity);
        return;
      }
      setIdleWarningOpen(state.phase === "warning");
      if (state.phase === "warning") {
        setIdleRemaining(formatIdleRemaining(state.remainingMs));
        timer = window.setTimeout(update, IDLE_WARNING_TICK_MS);
      } else {
        const untilWarning = Math.max(1, IDLE_WARNING_AFTER_MS - state.elapsedMs);
        timer = window.setTimeout(update, Math.min(untilWarning, IDLE_EXPIRE_AFTER_MS));
      }
    };
    const recordActivity = () => {
      if (disposed || idleLocked.current) return;
      if (clock.state().phase === "expired") {
        blockIdleIdentity(identity);
        return;
      }
      const timestamp = clock.markActivity();
      if (storage) persistIdleActivity(storage, key, timestamp);
      setIdleWarningOpen(false);
      update();
    };
    const onActivity = (event: Event) => {
      if (
        (event.type === "pointerdown" || event.type === "click") &&
        event.target instanceof Element &&
        event.target.closest("[data-idle-continue]")
      ) {
        return;
      }
      if (!isTrustedIdleActivity(event)) return;
      const now = monotonicNow();
      if (now - lastHandledActivity < 750) return;
      lastHandledActivity = now;
      recordActivity();
    };
    const onResume = () => {
      if (document.visibilityState === "visible") update();
    };
    const onPageShow = () => update();
    idleContinueHandler.current = recordActivity;

    for (const eventName of [
      "pointerdown",
      "keydown",
      "touchstart",
      "touchmove",
      "wheel",
      "click",
    ]) {
      document.addEventListener(eventName, onActivity, { capture: true, passive: true });
    }
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    window.addEventListener("pageshow", onPageShow);
    update();

    return () => {
      disposed = true;
      if (idleContinueHandler.current === recordActivity) idleContinueHandler.current = null;
      clearTimer();
      for (const eventName of [
        "pointerdown",
        "keydown",
        "touchstart",
        "touchmove",
        "wheel",
        "click",
      ]) {
        document.removeEventListener(eventName, onActivity, true);
      }
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [authReady, blockIdleIdentity, passwordSetupStatus, user?.authUserId]);

  const updateEmployee = useCallback(
    async (
      username: string,
      patch: { name?: string; phone?: string | null; role?: Role; permissions?: Permission[] },
    ) => {
      const expected = {
        ...(patch.name ? { name: patch.name.trim() } : {}),
        ...(Object.hasOwn(patch, "phone") ? { phone: patch.phone } : {}),
        ...(patch.role ? { role: patch.role } : {}),
        ...(patch.permissions ? { permissions: patch.permissions } : {}),
      };
      const reconcile = async () => {
        const { data: persisted, error: readError } = await supabase
          .from("user_profiles")
          .select("username, name, phone, role, permissions, active, password_change_required")
          .eq("username", username.trim().toLowerCase())
          .maybeSingle();
        if (readError || !persisted) return false;
        try {
          requireConfirmedEmployeeProfile({ profile: persisted }, username, expected);
          setUsers((current) =>
            current.map((entry) =>
              entry.username.toLowerCase() === username.trim().toLowerCase()
                ? toPublic(persisted as ProfileRow, entry.authUserId)
                : entry,
            ),
          );
          return true;
        } catch {
          return false;
        }
      };
      const { data, error } = await supabase.functions.invoke<{ profile: ProfileRow }>(
        "manage-profile",
        {
          body: {
            action: "update",
            username,
            ...patch,
            ...(patch.role === "admin" ? { confirm_admin_role: true } : {}),
          },
        },
      );
      if (error) {
        const status =
          error &&
          typeof error === "object" &&
          "context" in error &&
          error.context instanceof Response
            ? error.context.status
            : 0;
        const mayHavePersisted = status === 0 || status === 409 || status === 503;
        if (!mayHavePersisted || !(await reconcile()))
          throw new Error(employeeActionErrorMessage(error, "update"));
      } else {
        try {
          requireConfirmedEmployeeProfile(data, username, expected);
        } catch (confirmationError) {
          if (!(await reconcile())) throw confirmationError;
        }
      }
      if (!(await refreshUsers())) {
        const reconciled = await reconcile();
        if (!reconciled) {
          throw new Error("El cambio se guardó, pero no se pudo confirmar la lista actualizada.");
        }
      }
      announceInvalidation();
      if (username === user?.username) await revalidateSession(true);
    },
    [announceInvalidation, refreshUsers, revalidateSession, user?.username],
  );

  const createEmployee = useCallback(
    async (input: {
      username: string;
      name: string;
      email: string;
      phone: string;
      role: Role;
      confirmAdminCreation?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke<{
        profile: ProfileRow;
        setup_url?: string;
      }>("manage-profile", {
        body: {
          action: "create_user",
          username: input.username,
          name: input.name,
          email: input.email,
          phone: input.phone,
          role: input.role,
          ...(input.confirmAdminCreation ? { confirm_admin_creation: true } : {}),
        },
      });
      if (error) throw new Error(employeeActionErrorMessage(error, "create"));
      requireConfirmedEmployeeProfile(data, input.username, {
        active: false,
        name: input.name,
        phone: input.phone,
        role: input.role,
      });
      if (!data?.setup_url) throw new Error("El servidor no devolvió un enlace de configuración.");
      await refreshUsers();
      announceInvalidation();
      return { setupUrl: data.setup_url };
    },
    [announceInvalidation, refreshUsers],
  );

  const removeEmployee = useCallback(
    async (username: string) => {
      const { data, error } = await supabase.functions.invoke<{ profile: ProfileRow }>(
        "manage-profile",
        {
          body: { action: "revoke", username },
        },
      );
      if (error) throw new Error(employeeActionErrorMessage(error, "revoke"));
      requireConfirmedEmployeeProfile(data, username, { active: false });
      await refreshUsers();
      announceInvalidation();
      if (username === user?.username) await revalidateSession(true);
    },
    [announceInvalidation, refreshUsers, revalidateSession, user?.username],
  );

  const activateEmployee = useCallback(
    async (username: string) => {
      const { data, error } = await supabase.functions.invoke<{ profile: ProfileRow }>(
        "manage-profile",
        {
          body: { action: "activate", username },
        },
      );
      if (error) throw new Error(employeeActionErrorMessage(error, "activate"));
      requireConfirmedEmployeeProfile(data, username, { active: true });
      await refreshUsers();
      announceInvalidation();
    },
    [announceInvalidation, refreshUsers],
  );

  const createEmployeeRecoveryLink = useCallback(async (username: string) => {
    const { data, error } = await supabase.functions.invoke<{ recovery_url?: string }>(
      "manage-profile",
      { body: { action: "generate_recovery_link", username } },
    );
    if (error) throw new Error(employeeActionErrorMessage(error, "recovery"));
    if (typeof data?.recovery_url !== "string" || !data.recovery_url) {
      throw new Error("El servidor no confirmó el enlace de recuperación.");
    }
    return data.recovery_url;
  }, []);

  const isAdmin = user?.role === "admin";
  const completePasswordSetup = useCallback(() => {
    setPasswordSetupError(null);
    setPasswordSetupStatus("complete");
  }, []);
  const cancelPasswordSetup = useCallback(async () => {
    if (passwordSetupFlowActive.current) {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw new Error("No se pudo cerrar la sesión temporal. Intenta de nuevo.");
    }
    // Invalidate any deferred callback from the temporary invite session
    // before allowing a normal login on the same page.
    authRevision.current += 1;
    loginAttempt.current += 1;
    passwordSetupFlowActive.current = false;
    passwordSetupIdentity.current = null;
    setPasswordSetupError(null);
    setPasswordSetupStatus("none");
  }, []);
  const can = useCallback(
    (permission: Permission) =>
      Boolean(user && (user.role === "admin" || user.permissions.includes(permission))),
    [user],
  );

  return (
    <Ctx.Provider
      value={{
        user,
        users,
        usersStatus,
        usersError,
        refreshUsers,
        authReady,
        passwordSetupStatus,
        passwordSetupError,
        completePasswordSetup,
        cancelPasswordSetup,
        scopeKey,
        login,
        logout,
        can,
        isAdmin,
        idleExpiryMessage,
        updateEmployee,
        createEmployee,
        removeEmployee,
        activateEmployee,
        createEmployeeRecoveryLink,
      }}
    >
      <Dialog
        open={idleWarningOpen}
        onOpenChange={(open) => {
          if (!open && user?.authUserId) {
            // Any explicit dialog close is a real user action and must reset
            // both the in-memory monotonic clock and the persisted timestamp.
            idleContinueHandler.current?.();
          }
        }}
      >
        <DialogContent
          aria-describedby="idle-session-warning-description"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          className="max-w-md"
        >
          <DialogHeader>
            <DialogTitle>Tu sesión está por expirar</DialogTitle>
            <DialogDescription id="idle-session-warning-description">
              Por seguridad, tu sesión se cerrará automáticamente en 5 minutos debido a la
              inactividad.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tiempo restante:{" "}
            <span aria-live="polite" aria-atomic="true" className="font-semibold text-foreground">
              {idleRemaining}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            Los cambios que no hayas enviado pueden perderse al vencer la sesión. Si una operación
            financiera ya fue enviada, su resultado se verificará antes de cualquier reintento.
          </p>
          <DialogFooter>
            <Button
              type="button"
              data-idle-continue="true"
              onClick={() => idleContinueHandler.current?.()}
            >
              Continuar sesión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Fragment key={scopeKey}>{children}</Fragment>
    </Ctx.Provider>
  );
}

export function useAuth() {
  const context = useContext(Ctx);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
