import { Link, useRouterState } from "@tanstack/react-router";
import { Gem, LayoutDashboard, Users, Package, Receipt, ShoppingBag, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const items = [
  { to: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { to: "/clients", label: "Clientes", icon: Users },
  { to: "/inventory", label: "Inventario", icon: Package },
  { to: "/sales", label: "Ventas", icon: Receipt },
  { to: "/purchases", label: "Compras", icon: ShoppingBag },
  { to: "/settings", label: "Ajustes", icon: Settings },
] as const;

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, logout } = useAuth();

  return (
    <aside className="no-print w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
      <div className="px-6 py-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Gem className="h-6 w-6 text-sidebar-primary" />
          <div>
            <h1 className="font-display text-2xl leading-none text-sidebar-primary">Lustre</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/60 mt-1">
              Suite Joyera
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map((item) => {
          const active = path === item.to || path.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="text-xs text-sidebar-foreground/60 mb-1">Sesión iniciada</div>
        <div className="text-sm font-medium truncate">{user?.name}</div>
        <div className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</div>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="w-full mt-3 justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </Button>
      </div>
    </aside>
  );
}
