import { useState } from "react";
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
  Menu,
} from "lucide-react";
import { useAuth, type Permission } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <img
        src={graceLogo}
        alt="GRACE SUPPLY"
        className="h-10 w-10 shrink-0 rounded-full border border-[#D4AF37]/50 object-contain shadow-md shadow-[#D4AF37]/10"
      />
      <div className="min-w-0 overflow-hidden">
        <p className="truncate font-display text-lg font-bold leading-tight tracking-wider text-white">GRACE SUPPLY</p>
        <p className="mt-0.5 truncate text-[9px] font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">
          Barbería &amp; Belleza
        </p>
      </div>
    </div>
  );
}

function SidebarContents({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, logout, can, isAdmin } = useAuth();
  const visible = items.filter((item) => can(item.perm));

  const linkClass = (active: boolean) =>
    `flex min-h-11 items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505] ${
      active
        ? "border-l-2 border-[#D4AF37] bg-[#D4AF37]/15 text-[#D4AF37] shadow-sm shadow-[#D4AF37]/5"
        : "text-neutral-300 hover:bg-[#141414] hover:text-white"
    }`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#050505] text-[#F5F5F5]">
      <div className="border-b border-[#1F1F1F] px-6 py-6">
        <Brand />
      </div>

      <nav aria-label="Navegación principal" className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
        {visible.map((item) => {
          const active = path === item.to || path.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={linkClass(active)}
            >
              <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${active ? "text-[#D4AF37]" : "text-neutral-400"}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {isAdmin && (
          <Link
            to="/team"
            aria-current={path.startsWith("/team") ? "page" : undefined}
            onClick={onNavigate}
            className={linkClass(path.startsWith("/team"))}
          >
            <UserCog aria-hidden="true" className={`h-4 w-4 shrink-0 ${path.startsWith("/team") ? "text-[#D4AF37]" : "text-neutral-400"}`} />
            <span>Empleados</span>
          </Link>
        )}
      </nav>

      <div className="shrink-0 border-t border-[#1F1F1F] bg-[#080808] p-4">
        <div className="mb-1 flex items-center justify-between gap-2 text-xs text-neutral-300">
          <span className="truncate">{user?.name}</span>
          <span className="shrink-0 rounded border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-[#D4AF37]">
            {user?.role === "admin" ? "Admin" : "Staff"}
          </span>
        </div>
        <div className="truncate text-xs text-neutral-400">{user?.username}</div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { onNavigate?.(); void logout(); }}
          className="mt-3 h-10 w-full justify-start border border-[#262626] text-neutral-300 hover:bg-[#171717] hover:text-[#FF6B6B]"
        >
          <LogOut aria-hidden="true" className="mr-2 h-4 w-4" />
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}

export function AppSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <header className="no-print sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-[#262626] bg-[#050505] px-4 text-[#F5F5F5] lg:hidden">
        <Brand />
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Abrir menú"
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation-panel"
            className="h-11 w-11 text-[#D4AF37] hover:bg-[#171717] hover:text-[#D4AF37]"
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
          </Button>
        </SheetTrigger>
      </header>

      <aside aria-label="Barra lateral" className="no-print hidden h-svh max-h-screen w-64 shrink-0 border-r border-[#262626] bg-[#050505] lg:sticky lg:top-0 lg:flex lg:flex-col">
        <SidebarContents />
      </aside>

      <SheetContent
        id="mobile-navigation-panel"
        side="left"
        className="w-[18rem] max-w-[calc(100vw-2rem)] border-[#262626] bg-[#050505] p-0 text-[#F5F5F5] [&>button]:text-neutral-300 [&>button]:hover:text-white"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Menú principal</SheetTitle>
          <SheetDescription>Navegación principal de Grace Supply</SheetDescription>
        </SheetHeader>
        <SidebarContents onNavigate={() => setMobileOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
