import { createFileRoute, Link } from "@tanstack/react-router";
import { useSupabaseTable, fmtMoney } from "@/lib/storage";
import { useSettings } from "@/lib/settings";
import type { Sale, InventoryItem, Client, Expense } from "@/lib/types";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Receipt, Package, Users, TrendingUp, Scissors, Wallet } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data: sales } = useSupabaseTable<Sale>("sales");
  const { data: inventory } = useSupabaseTable<InventoryItem>("inventory");
  const { data: clients } = useSupabaseTable<Client>("clients");
  const { data: expenses } = useSupabaseTable<Expense>("expenses");
  const [settings] = useSettings();

  const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
  const inventoryValue = inventory.reduce((s, x) => s + x.price * x.quantity, 0);

  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const monthExpenses = expenses.filter((e) => e.status === "registrado" && e.date.startsWith(currentMonthStr));
  const monthExpenseTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);

  const recent = [...sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <div>
      <PageHeader
        title="Panel General"
        description={`Bienvenido a ${settings.businessName} · Sistema de Gestión de Barbería & Belleza.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Ingresos totales"
          value={fmtMoney(totalRevenue, settings.currency)}
          hint={`${sales.length} ventas registradas`}
          icon={<Receipt className="h-5 w-5 text-[#D4AF37]" />}
        />
        <StatCard
          label="Gastos del mes"
          value={fmtMoney(monthExpenseTotal, settings.currency)}
          hint={`${monthExpenses.length} egresos este mes`}
          icon={<Wallet className="h-5 w-5 text-rose-400" />}
        />
        <StatCard
          label="Valor del inventario"
          value={fmtMoney(inventoryValue, settings.currency)}
          hint={`${inventory.length} productos registrados`}
          icon={<Package className="h-5 w-5 text-[#D4AF37]" />}
        />
        <StatCard
          label="Clientes"
          value={String(clients.length)}
          hint="registros activos"
          icon={<Users className="h-5 w-5 text-[#D4AF37]" />}
        />
      </div>

      <div className="grid gap-6 mt-8 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/50">
            <h2 className="text-xl font-display font-semibold tracking-tight text-foreground">
              Ventas recientes
            </h2>
            <Link to="/sales" className="text-xs text-[#D4AF37] hover:underline font-medium">
              Ver todas →
            </Link>
          </div>
          {recent.length === 0 ? (
            <EmptyHint icon={<Receipt className="h-5 w-5" />} text="Aún no hay ventas. Crea tu primer comprobante." />
          ) : (
            <ul className="divide-y divide-border/60">
              {recent.map((s) => {
                const client = clients.find((c) => c.id === s.clientId);
                return (
                  <li key={s.id} className="py-3 flex items-center justify-between hover:bg-muted/30 px-2 rounded-lg transition-colors">
                    <div>
                      <div className="text-sm font-medium text-foreground">{s.receiptNo}</div>
                      <div className="text-xs text-muted-foreground">{client?.name || "Cliente mostrador"}</div>
                    </div>
                    <div className="text-sm font-mono font-semibold text-[#D4AF37]">
                      {fmtMoney(s.total, settings.currency)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/50">
            <h2 className="text-xl font-display font-semibold tracking-tight text-foreground">
              Acciones rápidas
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <QuickLink to="/sales" icon={<Receipt className="h-5 w-5" />} label="Nueva venta" />
            <QuickLink to="/expenses" icon={<Wallet className="h-5 w-5" />} label="Registrar gasto" />
            <QuickLink to="/inventory" icon={<Package className="h-5 w-5" />} label="Agregar producto" />
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
      <div className="h-9 w-9 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
        {icon}
      </div>
      {text}
    </div>
  );
}

function QuickLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg border border-border p-4 hover:border-[#D4AF37] hover:bg-[#D4AF37]/5 transition-all duration-200 group"
    >
      <div className="text-muted-foreground group-hover:text-[#D4AF37] transition-colors">{icon}</div>
      <div className="text-sm font-medium group-hover:text-foreground transition-colors">{label}</div>
    </Link>
  );
}
