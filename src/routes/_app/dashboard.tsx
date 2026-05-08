import { createFileRoute, Link } from "@tanstack/react-router";
import { useLocalStore, fmtMoney } from "@/lib/storage";
import { useSettings } from "@/lib/settings";
import type { Sale, InventoryItem, Client } from "@/lib/types";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Receipt, Package, Users, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const [sales] = useLocalStore<Sale[]>("lustre_sales", []);
  const [inventory] = useLocalStore<InventoryItem[]>("lustre_inventory", []);
  const [clients] = useLocalStore<Client[]>("lustre_clients", []);
  const [settings] = useSettings();

  const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
  const inventoryValue = inventory.reduce((s, x) => s + x.price * x.quantity, 0);
  const lowStock = inventory.filter((i) => i.quantity <= 1);

  const recent = [...sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <div>
      <PageHeader title="Dashboard" description={`Welcome to ${settings.businessName}.`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Revenue" value={fmtMoney(totalRevenue, settings.currency)} hint={`${sales.length} sales`} />
        <StatCard label="Inventory Value" value={fmtMoney(inventoryValue, settings.currency)} hint={`${inventory.length} items`} />
        <StatCard label="Clients" value={String(clients.length)} hint="active records" />
        <StatCard label="Low Stock" value={String(lowStock.length)} hint="≤ 1 in stock" />
      </div>

      <div className="grid gap-6 mt-8 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-display">Recent Sales</h2>
            <Link to="/sales" className="text-xs text-muted-foreground hover:text-foreground">View all →</Link>
          </div>
          {recent.length === 0 ? (
            <EmptyHint icon={<Receipt className="h-5 w-5" />} text="No sales yet. Create your first receipt." />
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((s) => {
                const client = clients.find((c) => c.id === s.clientId);
                return (
                  <li key={s.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{s.receiptNo}</div>
                      <div className="text-xs text-muted-foreground">{client?.name || "Walk-in"}</div>
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
            <h2 className="text-xl font-display">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <QuickLink to="/sales" icon={<Receipt className="h-5 w-5" />} label="New sale" />
            <QuickLink to="/inventory" icon={<Package className="h-5 w-5" />} label="Add item" />
            <QuickLink to="/clients" icon={<Users className="h-5 w-5" />} label="Add client" />
            <QuickLink to="/purchases" icon={<TrendingUp className="h-5 w-5" />} label="Log purchase" />
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
