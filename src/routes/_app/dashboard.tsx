import { createFileRoute, Link } from "@tanstack/react-router";
import { useSupabaseTable, fmtMoney } from "@/lib/storage";
import { useSettings } from "@/lib/settings";
import type { Sale, InventoryItem, Client } from "@/lib/types";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Receipt, Package, Users, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data: sales } = useSupabaseTable<Sale>("sales");
  const { data: inventory } = useSupabaseTable<InventoryItem>("inventory");
  const { data: clients } = useSupabaseTable<Client>("clients");
  const [settings] = useSettings();

  const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
  const inventoryValue = inventory.reduce((s, x) => s + x.price * x.quantity, 0);
  const lowStock = inventory.filter((i) => i.quantity <= 1);

  const recent = [...sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <div>
      <PageHeader title="Panel" description={`Bienvenido a ${settings.businessName}.`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ingresos totales" value={fmtMoney(totalRevenue, settings.currency)} hint={`${sales.length} ventas`} />
        <StatCard label="Valor de inventario" value={fmtMoney(inventoryValue, settings.currency)} hint={`${inventory.length} piezas`} />
        <StatCard label="Clientes" value={String(clients.length)} hint="registros activos" />
        <StatCard label="Bajo stock" value={String(lowStock.length)} hint="≤ 1 en existencia" />
      </div>

      <div className="grid gap-6 mt-8 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-display">Ventas recientes</h2>
            <Link to="/sales" className="text-xs text-muted-foreground hover:text-foreground">Ver todas →</Link>
          </div>
          {recent.length === 0 ? (
            <EmptyHint icon={<Receipt className="h-5 w-5" />} text="Aún no hay ventas. Crea tu primer recibo." />
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((s) => {
                const client = clients.find((c) => c.id === s.clientId);
                return (
                  <li key={s.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{s.receiptNo}</div>
                      <div className="text-xs text-muted-foreground">{client?.name || "Mostrador"}</div>
                    </div>
                    <div className="text-sm font-mono">{fmtMoney(s.total, settings.currency)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-display">Acciones rápidas</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <QuickLink to="/sales" icon={<Receipt className="h-5 w-5" />} label="Nueva venta" />
            <QuickLink to="/inventory" icon={<Package className="h-5 w-5" />} label="Agregar pieza" />
            <QuickLink to="/clients" icon={<Users className="h-5 w-5" />} label="Agregar cliente" />
            <QuickLink to="/purchases" icon={<TrendingUp className="h-5 w-5" />} label="Registrar compra" />
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyHint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground py-6">
      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground">{icon}</div>
      {text}
    </div>
  );
}

function QuickLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-md border border-border p-4 hover:border-primary hover:bg-accent/30 transition-colors"
    >
      <div className="text-primary">{icon}</div>
      <div className="text-sm font-medium">{label}</div>
    </Link>
  );
}
