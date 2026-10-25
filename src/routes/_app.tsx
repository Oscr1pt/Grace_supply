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
    <div className="min-h-screen flex flex-col bg-background lg:flex-row">
      <AppSidebar />
      <main className="min-w-0 flex-1">
        <div className="mx-auto min-w-0 w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
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
    <div className="mx-auto max-w-lg rounded-lg border border-border bg-card p-6 text-center sm:p-10">
      <h2 className="font-display text-2xl">Acceso restringido</h2>
      <p className="text-sm text-muted-foreground mt-2">
        Tu cuenta no tiene permiso para ver esta sección. Contacta al administrador de la tienda.
      </p>
    </div>
  );
}
