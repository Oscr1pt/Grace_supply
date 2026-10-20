import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Building2,
  Package,
  Receipt,
  ShoppingBag,
  Wallet,
  Settings,
  LogOut,
  UserCog,
  Scissors,
} from "lucide-react";
import { useAuth, type Permission } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import graceLogo from "@/assets/grace-logo.png";

const items = [
  { to: "/dashboard", label: "Panel", icon: LayoutDashboard, perm: "dashboard" as Permission },
  { to: "/clients", label: "Clientes", icon: Users, perm: "clients" as Permission },
  { to: "/suppliers", label: "Proveedores", icon: Building2, perm: "suppliers" as Permission },
  { to: "/inventory", label: "Inventario", icon: Package, perm: "inventory" as Permission },
  { to: "/sales", label: "Ventas", icon: Receipt, perm: "sales" as Permission },
  { to: "/purchases", label: "Compras", icon: ShoppingBag, perm: "purchases" as Permission },
  { to: "/expenses", label: "Gastos", icon: Wallet, perm: "expenses" as Permission },
  { to: "/settings", label: "Ajustes", icon: Settings, perm: "settings" as Permission },
] as const;

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, logout, can, isAdmin } = useAuth();

  const visible = items.filter((i) => can(i.perm));

  return (
    <aside className="no-print w-64 shrink-0 bg-[#050505] text-[#F5F5F5] flex flex-col border-r border-[#262626]">
      {/* Sidebar Header with Grace Supply Logo */}
      <div className="px-6 py-6 border-b border-[#1F1F1F]">
        <div className="flex items-center gap-3">
          <img
            src={graceLogo}
            alt="GRACE SUPPLY Logo"
            className="h-10 w-10 object-contain rounded-full border border-[#D4AF37]/50 shadow-md shadow-[#D4AF37]/10"
          />
          <div className="overflow-hidden">
            <h1 className="font-display text-lg font-bold tracking-wider text-[#FFFFFF] leading-tight truncate">
              GRACE SUPPLY
            </h1>
            <p className="text-[9px] uppercase tracking-[0.2em] text-[#D4AF37] font-semibold mt-0.5 truncate">
              Barbería & Belleza
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {visible.map((item) => {
          const active = path === item.to || path.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                active
                  ? "bg-[#D4AF37]/15 text-[#D4AF37] border-l-2 border-[#D4AF37] shadow-sm shadow-[#D4AF37]/5"
                  : "text-neutral-400 hover:bg-[#141414] hover:text-[#FFFFFF]"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-[#D4AF37]" : "text-neutral-400"}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {isAdmin && (
          <Link
            to="/team"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              path.startsWith("/team")
                ? "bg-[#D4AF37]/15 text-[#D4AF37] border-l-2 border-[#D4AF37] shadow-sm shadow-[#D4AF37]/5"
                : "text-neutral-400 hover:bg-[#141414] hover:text-[#FFFFFF]"
            }`}
          >
            <UserCog className={`h-4 w-4 ${path.startsWith("/team") ? "text-[#D4AF37]" : "text-neutral-400"}`} />
            <span>Empleados</span>
          </Link>
        )}
      </nav>

      {/* Footer Profile & Logout */}
      <div className="border-t border-[#1F1F1F] p-4 bg-[#080808]">
        <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
          <span className="truncate">{user?.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#D4AF37]/10 text-[#D4AF37] font-mono border border-[#D4AF37]/20 uppercase">
            {user?.role === "admin" ? "Admin" : "Staff"}
          </span>
        </div>
        <div className="text-xs text-neutral-500 truncate">{user?.username}</div>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="w-full mt-3 justify-start text-neutral-400 hover:bg-[#171717] hover:text-[#FF6B6B] h-9 border border-[#262626]"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Cerrar sesión
        </Button>
      </div>
    </aside>
  );
}
