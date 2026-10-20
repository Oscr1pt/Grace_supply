import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth, type Permission } from "@/lib/auth";

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
  const { user, can, isAdmin } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (!user) return <Navigate to="/login" replace />;

  const perm = Object.entries(routePerms).find(([p]) => path === p || path.startsWith(p + "/"))?.[1];
  const adminOnly = path.startsWith("/team");
  const allowed = adminOnly ? isAdmin : perm ? can(perm) : true;

  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-8 py-10">
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
