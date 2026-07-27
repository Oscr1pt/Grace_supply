import { Link, useRouterState } from "@tanstack/react-router";
import { Gem, LayoutDashboard, Users, Package, Receipt, ShoppingBag, Settings, LogOut, UserCog } from "lucide-react";
import { useAuth, type Permission } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const items = [
  { to: "/dashboard", label: "Panel", icon: LayoutDashboard, perm: "dashboard" as Permission },
  { to: "/clients", label: "Clientes", icon: Users, perm: "clients" as Permission },
  { to: "/inventory", label: "Inventario", icon: Package, perm: "inventory" as Permission },
  { to: "/sales", label: "Ventas", icon: Receipt, perm: "sales" as Permission },
  { to: "/purchases", label: "Compras", icon: ShoppingBag, perm: "purchases" as Permission },
  { to: "/settings", label: "Ajustes", icon: Settings, perm: "settings" as Permission },
] as const;

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, logout, can, isAdmin } = useAuth();

  const visible = items.filter((i) => can(i.perm));

  return (
    <aside className="no-print w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
      <div className="px-6 py-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Gem className="h-6 w-6 text-sidebar-primary" />
          <div>
            <h1 className="font-display text-xl leading-none text-sidebar-primary">IMPERIO GOLD</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/60 mt-1">
              Joyería
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {visible.map((item) => {
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

        {isAdmin && (
          <Link
            to="/team"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
              path.startsWith("/team")
                ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <UserCog className="h-4 w-4" />
            Empleados
          </Link>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="text-xs text-sidebar-foreground/60 mb-1">
          Sesión iniciada · {user?.role === "admin" ? "Administrador" : "Empleado"}
        </div>
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
