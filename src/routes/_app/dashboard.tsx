import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { useAuth } from "@/lib/auth";
import { getDashboardReadState, calculateDashboardMetrics } from "@/lib/dashboardMetrics.js";
import { fmtMoney, useSupabaseTable } from "@/lib/storage";
import type { Client, Expense, InventoryItem, Sale } from "@/lib/types";
import { Package, Receipt, Users, Wallet, ShoppingBag, Building2 } from "lucide-react";
import type { ReactNode } from "react";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

type DashboardInventoryItem = Pick<InventoryItem, "id" | "price" | "quantity" | "isActive">;

function Dashboard() {
  const { can } = useAuth();
  const salesAllowed = can("sales") || can("clients");
  const clientsAllowed = can("clients");
  const inventoryAllowed = can("inventory");
  const expensesAllowed = can("expenses");

  const salesQuery = useSupabaseTable<Sale>("sales", "created_at", false, "*", salesAllowed);
  const inventoryQuery = useSupabaseTable<DashboardInventoryItem>(
    "inventory",
    "created_at",
    false,
    "id,price,quantity,is_active",
    inventoryAllowed,
  );
  const clientsQuery = useSupabaseTable<Client>(
    "clients",
    "created_at",
    false,
    "*",
    clientsAllowed,
  );
  const expensesQuery = useSupabaseTable<Expense>(
    "expenses",
    "created_at",
    false,
    "*",
    expensesAllowed,
  );

  const metrics = calculateDashboardMetrics(
    {
      sales: salesQuery.data,
      inventory: inventoryQuery.data,
      clients: clientsQuery.data,
      expenses: expensesQuery.data,
    },
    new Date(),
  );
  const salesState = getDashboardReadState(salesQuery, salesAllowed);
  const activeSales = metrics.recentSales;

  return (
    <div className="min-w-0">
      <PageHeader
        title="Panel General"
        description="Indicadores del período y actividad reciente. Los datos se muestran según los permisos de tu cuenta."
      />

      <section
        aria-label="Indicadores operativos"
        className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-5"
      >
        <MetricCard
          label="Ventas contabilizadas · mes"
          query={salesQuery}
          allowed={salesAllowed}
          icon={<Receipt aria-hidden="true" className="h-5 w-5" />}
          value={fmtMoney(metrics.monthSalesAmount)}
          hint={`${metrics.monthSalesCount} documentos · contado y crédito · ${metrics.salesTodayCount} hoy${metrics.monthUnclassifiedSalesCount ? ` · ${metrics.monthUnclassifiedSalesCount} sin forma de pago` : ""}`}
          emptyHint="No hay ventas contabilizadas este mes."
          retryLabel="ventas"
        />
        <MetricCard
          label="Ventas al contado · mes"
          query={salesQuery}
          allowed={salesAllowed}
          icon={<Receipt aria-hidden="true" className="h-5 w-5" />}
          value={fmtMoney(metrics.monthCashSalesAmount)}
          hint={`${metrics.monthCashSalesCount} ventas cobradas al registrarse · no incluye abonos a crédito`}
          emptyHint="No hay ventas al contado este mes."
          retryLabel="ventas al contado"
        />
        <MetricCard
          label="Gastos registrados · mes"
          query={expensesQuery}
          allowed={expensesAllowed}
          icon={<Wallet aria-hidden="true" className="h-5 w-5 text-rose-400" />}
          value={fmtMoney(metrics.monthExpenseAmount)}
          hint={`${metrics.monthExpenseCount} gastos · anulados excluidos`}
          emptyHint="No hay gastos registrados este mes."
          retryLabel="gastos"
        />
        <MetricCard
          label="Inventario a precio de venta"
          query={inventoryQuery}
          allowed={inventoryAllowed}
          icon={<Package aria-hidden="true" className="h-5 w-5" />}
          value={fmtMoney(metrics.estimatedInventorySaleValue)}
          hint={`Estimado: precio × cantidad · ${metrics.activeInventoryCount} activos · ${metrics.inactiveInventoryCount} inactivos`}
          emptyHint="No hay productos activos para estimar."
          retryLabel="inventario"
        />
        <MetricCard
          label="Clientes activos"
          query={clientsQuery}
          allowed={clientsAllowed}
          icon={<Users aria-hidden="true" className="h-5 w-5" />}
          value={String(metrics.activeClientCount)}
          hint={`${metrics.inactiveClientCount} inactivos${metrics.unknownClientStatusCount ? ` · ${metrics.unknownClientStatusCount} sin estado reconocido` : ""}`}
          emptyHint="No hay clientes registrados."
          retryLabel="clientes"
        />
      </section>

      <div className="mt-8 grid min-w-0 gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="recent-sales-title"
          className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6"
        >
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-border/50 pb-3">
            <h2
              id="recent-sales-title"
              className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl"
            >
              Ventas recientes
            </h2>
          </div>
          <RecentSales
            state={salesState}
            sales={activeSales}
            clients={clientsQuery.data}
            canReadClients={clientsAllowed}
            currency="DOP"
            onRetry={() => void salesQuery.refresh()}
            error={salesQuery.loadError}
          />
        </section>

        <section
          aria-labelledby="quick-actions-title"
          className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6"
        >
          <div className="mb-4 border-b border-border/50 pb-3">
            <h2
              id="quick-actions-title"
              className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl"
            >
              Acciones rápidas
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {clientsAllowed && (
              <QuickLink
                to="/clients"
                icon={<Users aria-hidden="true" className="h-5 w-5" />}
                label="Abrir directorio"
              />
            )}
            {inventoryAllowed && (
              <QuickLink
                to="/inventory"
                icon={<Package aria-hidden="true" className="h-5 w-5" />}
                label="Abrir inventario"
              />
            )}
            {can("expenses") && (
              <QuickLink
                to="/expenses"
                icon={<Wallet aria-hidden="true" className="h-5 w-5" />}
                label="Registrar gasto"
              />
            )}
            {can("purchases") && (
              <QuickLink
                to="/purchases"
                icon={<ShoppingBag aria-hidden="true" className="h-5 w-5" />}
                label="Registrar compra"
              />
            )}
            {can("suppliers") && (
              <QuickLink
                to="/suppliers"
                icon={<Building2 aria-hidden="true" className="h-5 w-5" />}
                label="Consultar proveedores"
              />
            )}
            {!clientsAllowed &&
              !inventoryAllowed &&
              !can("expenses") &&
              !can("purchases") &&
              !can("suppliers") && (
                <p className="col-span-full text-sm text-muted-foreground">
                  No hay acciones adicionales disponibles para los permisos de tu cuenta.
                </p>
              )}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            La creación de ventas no aparece aquí; su disponibilidad depende de la política
            tributaria vigente.
          </p>
        </section>
      </div>
    </div>
  );
}

type TableQuery = {
  data: Array<{ id: string }>;
  loading: boolean;
  stale: boolean;
  loadError: string | null;
  loadErrorKind: string | null;
  refresh: () => Promise<void>;
};

function MetricCard({
  label,
  query,
  allowed,
  icon,
  value,
  hint,
  emptyHint,
  retryLabel,
}: {
  label: string;
  query: TableQuery;
  allowed: boolean;
  icon: ReactNode;
  value: string;
  hint: string;
  emptyHint: string;
  retryLabel: string;
}) {
  const state = getDashboardReadState(query, allowed);
  if (state === "denied") {
    return (
      <StatCard
        label={label}
        value="—"
        hint="No disponible: tu cuenta no tiene permiso para consultar este dato."
        icon={icon}
      />
    );
  }
  if (state === "loading") {
    return (
      <div role="status" aria-label={`Cargando ${retryLabel}`} aria-busy="true">
        <StatCard
          label={label}
          value={
            <span aria-hidden="true" className="block h-8 w-28 animate-pulse rounded bg-muted/70" />
          }
          hint="Cargando datos…"
          icon={icon}
        />
      </div>
    );
  }
  if (state === "error") {
    return (
      <div>
        <StatCard label={label} value="—" hint="No se pudo confirmar este indicador." icon={icon} />
        <ReadError
          error={query.loadError}
          retryLabel={retryLabel}
          onRetry={() => void query.refresh()}
        />
      </div>
    );
  }

  const stateHint =
    state === "stale"
      ? "Dato anterior; no se pudo actualizar."
      : state === "empty"
        ? emptyHint
        : hint;
  return (
    <div>
      <StatCard label={label} value={value} hint={stateHint} icon={icon} />
      {state === "stale" && (
        <ReadError
          error={query.loadError}
          retryLabel={retryLabel}
          onRetry={() => void query.refresh()}
        />
      )}
    </div>
  );
}

function ReadError({
  error,
  retryLabel,
  onRetry,
}: {
  error: string | null;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs"
      role="alert"
    >
      <span>{error || "No se pudo actualizar la lectura."}</span>
      <Button variant="outline" size="sm" className="min-h-9" onClick={onRetry}>
        Reintentar {retryLabel}
      </Button>
    </div>
  );
}

function RecentSales({
  state,
  sales,
  clients,
  canReadClients,
  currency,
  onRetry,
  error,
}: {
  state: ReturnType<typeof getDashboardReadState>;
  sales: Sale[];
  clients: Client[];
  canReadClients: boolean;
  currency: string;
  onRetry: () => void;
  error: string | null;
}) {
  if (state === "denied") {
    return (
      <p className="py-5 text-sm text-muted-foreground" role="status">
        No disponible: tu cuenta no tiene permiso para consultar ventas.
      </p>
    );
  }
  if (state === "loading") {
    return (
      <div
        role="status"
        aria-label="Cargando ventas recientes"
        aria-busy="true"
        className="space-y-3 py-3"
      >
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-10 animate-pulse rounded bg-muted/60" />
        ))}
      </div>
    );
  }
  if (state === "error") {
    return (
      <div>
        <p className="text-sm text-muted-foreground">No se pudieron leer las ventas recientes.</p>
        <ReadError error={error} retryLabel="ventas" onRetry={onRetry} />
      </div>
    );
  }
  if (sales.length === 0) {
    return <p className="py-5 text-sm text-muted-foreground">Aún no hay ventas contabilizadas.</p>;
  }

  const clientName = new Map(clients.map((client) => [client.id, client.name]));
  return (
    <>
      {state === "stale" && <ReadError error={error} retryLabel="ventas" onRetry={onRetry} />}
      <ul className="divide-y divide-border/60">
        {sales.map((sale) => (
          <li
            key={sale.id}
            className="flex min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/30"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{sale.receiptNo}</div>
              <div className="truncate text-xs text-muted-foreground">
                {canReadClients ? clientName.get(sale.clientId) || "Cliente" : "Cliente registrado"}{" "}
                · {formatBusinessDate(sale.createdAt)}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-mono font-semibold text-[#D4AF37]">
                {fmtMoney(sale.total, currency)}
              </div>
              <div className="text-xs text-muted-foreground">
                {sale.paymentType === "credito"
                  ? "Crédito"
                  : sale.paymentType === "contado"
                    ? "Contado"
                    : "Pago sin clasificar"}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function formatBusinessDate(value: string) {
  try {
    return new Intl.DateTimeFormat("es-DO", {
      timeZone: "America/Santo_Domingo",
      dateStyle: "medium",
    }).format(new Date(value));
  } catch {
    return "Fecha no disponible";
  }
}

function QuickLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="group flex min-h-12 min-w-0 items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:border-[#D4AF37] hover:bg-[#D4AF37]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:p-4"
    >
      <div className="shrink-0 text-muted-foreground transition-colors group-hover:text-[#D4AF37]">
        {icon}
      </div>
      <span className="min-w-0 break-words text-sm font-medium transition-colors group-hover:text-foreground">
        {label}
      </span>
    </Link>
  );
}
