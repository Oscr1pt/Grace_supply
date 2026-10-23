import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth, type Permission } from "@/lib/auth";
import { getReadFailures, subscribeReadFailures } from "@/lib/persistence.js";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const routePerms: Record<string, Permission> = {
  "/dashboard": "dashboard",
  "/clients": "clients",
  "/suppliers": "suppliers",
  "/inventory": "inventory",
  "/sales": "sales",
  "/purchases": "purchases",
  "/expenses": "expenses",
  "/settings": "settings",
};

function AppLayout() {
  const { user, authReady, can, isAdmin } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [readFailures, setReadFailures] = useState(getReadFailures);

  useEffect(() => subscribeReadFailures(setReadFailures), []);

  if (!authReady) {
    return <div role="status" className="min-h-screen grid place-items-center text-sm text-muted-foreground">Verificando sesión…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;

  const perm = Object.entries(routePerms).find(([p]) => path === p || path.startsWith(p + "/"))?.[1];
  const adminOnly = path.startsWith("/team");
  const allowed = adminOnly ? isAdmin : perm ? can(perm) : true;

  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-8 py-10">
          {readFailures.length > 0 && (
            <div role="alert" aria-live="polite" className="mb-5 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
              <p className="font-medium">Hay datos que no se pudieron actualizar.</p>
              <ul className="mt-1 list-disc pl-5">
                {readFailures.map(({ table, message }) => (
                  <li key={table}>{table}: {message} Los datos visibles pueden estar obsoletos.</li>
                ))}
              </ul>
            </div>
          )}
          {allowed ? <Outlet /> : <NoAccess />}
        </div>
      </main>
    </div>
  );
}

function NoAccess() {
  return (
    <div className="rounded-lg border border-border bg-card p-10 text-center max-w-lg mx-auto">
      <h2 className="font-display text-2xl">Acceso restringido</h2>
      <p className="text-sm text-muted-foreground mt-2">
        Tu cuenta no tiene permiso para ver esta sección. Contacta al administrador de la tienda.
      </p>
    </div>
  );
}
