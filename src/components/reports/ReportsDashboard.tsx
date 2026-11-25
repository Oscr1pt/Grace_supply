import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CalendarDays,
  ChartColumnIncreasing,
  FileText,
  Printer,
  RefreshCw,
  ShoppingBasket,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildReportSummary, formatReportMoney, toChartAmount } from "@/lib/reportPresentation.js";
import { formatReportPeriodRange, resolveReportPeriod } from "@/lib/reportPeriods.js";
import type {
  BusinessReportData,
  BusinessReportStatus,
  ReportPeriodType,
} from "@/lib/businessReports";

const BUSINESS_TIME_ZONE = "America/Santo_Domingo";

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  nomina: "Nómina",
  alquiler: "Alquiler",
  electricidad: "Electricidad",
  agua: "Agua",
  internet: "Internet",
  telefono: "Teléfono",
  transporte: "Transporte",
  combustible: "Combustible",
  mantenimiento: "Mantenimiento",
  papeleria: "Papelería",
  limpieza: "Limpieza",
  publicidad: "Publicidad",
  servicios_profesionales: "Servicios profesionales",
  comisiones: "Comisiones",
  impuestos: "Impuestos",
  otros: "Otros gastos operativos",
};

type ReportsDashboardProps = {
  status: BusinessReportStatus;
  data?: BusinessReportData;
  businessName: string;
  periodType: ReportPeriodType;
  anchorDate: string;
  onPeriodTypeChange: (period: ReportPeriodType) => void;
  onAnchorDateChange: (anchorDate: string) => void;
  onRetry?: () => void;
};

function dateMathAnchor(type: ReportPeriodType, anchorDate: string) {
  if (type === "month")
    return anchorDate.length === 7 ? `${anchorDate}-01` : anchorDate.slice(0, 7) + "-01";
  if (type === "year")
    return anchorDate.length === 4 ? `${anchorDate}-01-01` : anchorDate.slice(0, 4) + "-01-01";
  return anchorDate;
}

function selectorValue(type: ReportPeriodType, anchorDate: string) {
  if (type === "month") return anchorDate.slice(0, 7);
  if (type === "year") return anchorDate.slice(0, 4);
  return anchorDate;
}

function businessYearNow() {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: BUSINESS_TIME_ZONE,
      year: "numeric",
    }).format(new Date()),
  );
}

function formatChartMoney(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(amount)
    : "—";
}

function ReportState({ status, onRetry }: { status: BusinessReportStatus; onRetry?: () => void }) {
  if (status === "integration-pending") {
    return (
      <div
        className="rounded-xl border border-dashed border-[#D4AF37]/60 bg-[#D4AF37]/5 p-6 sm:p-8"
        role="status"
      >
        <div className="flex items-start gap-3">
          <FileText aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#9B7B17]" />
          <div>
            <h2 className="font-semibold">Consulta segura pendiente</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              La conexión protegida de reportes todavía no está integrada. No se muestran importes
              hasta recibir un resumen autorizado desde Supabase.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <span className="sr-only">Cargando reportes…</span>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl border bg-card" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-xl border bg-card" />
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="font-semibold">Acceso restringido</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Solo administradores activos pueden consultar reportes financieros.
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 text-destructive" />
          <div className="flex-1">
            <h2 className="font-semibold">No se pudo cargar el reporte</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Los importes no están disponibles. Reintenta la consulta.
            </p>
            {onRetry && (
              <Button type="button" variant="outline" onClick={onRetry} className="mt-4">
                <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />
                Reintentar
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  featured = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  featured?: boolean;
}) {
  return (
    <Card
      className={
        featured ? "border-[#D4AF37]/60 shadow-sm shadow-[#D4AF37]/10" : "border-border/80"
      }
    >
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium leading-5 text-muted-foreground sm:text-sm">
          {label}
        </CardTitle>
        <Icon
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 ${featured ? "text-[#A17E16]" : "text-muted-foreground"}`}
        />
      </CardHeader>
      <CardContent>
        <p
          className="break-words text-xl font-semibold tracking-tight sm:text-2xl"
          data-testid="report-metric-value"
        >
          {value}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

export function ReportsDashboard({
  status,
  data,
  businessName,
  periodType,
  anchorDate,
  onPeriodTypeChange,
  onAnchorDateChange,
  onRetry,
}: ReportsDashboardProps) {
  const calcAnchor = dateMathAnchor(periodType, anchorDate);
  const selectedRange = resolveReportPeriod(periodType, calcAnchor);
  const dataMatchesSelection =
    !!data &&
    data.period.type === periodType &&
    data.period.anchorDate === selectorValue(periodType, anchorDate);
  const awaitingSelectedPeriod =
    (status === "ready" || status === "empty") && !dataMatchesSelection;
  const effectiveStatus = awaitingSelectedPeriod ? "loading" : status;
  const reportVisible =
    (effectiveStatus === "ready" || effectiveStatus === "empty" || effectiveStatus === "stale") &&
    dataMatchesSelection &&
    data;
  const range = reportVisible
    ? formatReportPeriodRange(reportVisible.period.startDate, reportVisible.period.endDateExclusive)
    : formatReportPeriodRange(selectedRange.startDate, selectedRange.endDateExclusive);
  const generatedLabel = reportVisible
    ? new Intl.DateTimeFormat("es-DO", {
        timeZone: BUSINESS_TIME_ZONE,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(reportVisible.generatedAt))
    : null;
  const chartData = useMemo(
    () =>
      reportVisible
        ? reportVisible.buckets.map((bucket) => ({
            ...bucket,
            salesChartAmount: toChartAmount(bucket.salesSubtotal),
            expensesChartAmount: toChartAmount(bucket.operatingExpenses),
          }))
        : [],
    [reportVisible],
  );
  const expenseCategories = useMemo(
    () =>
      reportVisible
        ? reportVisible.expenseCategories.map((item) => ({
            ...item,
            displayLabel: item.label || EXPENSE_CATEGORY_LABELS[item.category] || item.category,
            chartAmount: toChartAmount(item.amount),
          }))
        : [],
    [reportVisible],
  );
  const printable = (effectiveStatus === "ready" || effectiveStatus === "empty") && !!reportVisible;

  const handlePrint = () => {
    if (printable && typeof window !== "undefined") window.print();
  };

  return (
    <div className="business-report-print-root space-y-6 sm:space-y-8" data-testid="reports-page">
      <div className="reports-no-print">
        <PageHeader
          title="Reportes"
          description="Consulta ventas, gastos y compras registradas en un período."
        />
      </div>

      <section
        aria-label="Filtros del reporte"
        className="reports-interactive-controls grid min-w-0 gap-4 rounded-xl border border-border/80 bg-card p-4 shadow-sm sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"
        data-testid="reports-interactive-controls"
      >
        <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)] md:items-end lg:col-start-1 lg:row-start-1">
          <div className="grid gap-2">
            <label htmlFor="report-period-type" className="text-sm font-medium">
              Tipo de período
            </label>
            <select
              id="report-period-type"
              value={periodType}
              onChange={(event) => onPeriodTypeChange(event.target.value as ReportPeriodType)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              disabled={status === "denied"}
            >
              <option value="week">Semana</option>
              <option value="month">Mes</option>
              <option value="year">Año</option>
            </select>
          </div>
          <div className="grid gap-2">
            <label htmlFor="report-period-anchor" className="text-sm font-medium">
              Período específico
            </label>
            {periodType === "week" ? (
              <input
                id="report-period-anchor"
                aria-label="Seleccionar semana"
                type="date"
                value={selectorValue(periodType, anchorDate)}
                onChange={(event) => onAnchorDateChange(event.target.value)}
                className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                disabled={status === "denied"}
              />
            ) : periodType === "month" ? (
              <input
                id="report-period-anchor"
                aria-label="Seleccionar mes"
                type="month"
                value={selectorValue(periodType, anchorDate)}
                onChange={(event) => onAnchorDateChange(event.target.value)}
                className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                disabled={status === "denied"}
              />
            ) : (
              <input
                id="report-period-anchor"
                aria-label="Seleccionar año"
                type="number"
                inputMode="numeric"
                min="2000"
                max={businessYearNow()}
                step="1"
                value={selectorValue(periodType, anchorDate)}
                onChange={(event) => onAnchorDateChange(event.target.value)}
                className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                disabled={status === "denied"}
              />
            )}
          </div>
        </div>

        <p
          className="min-w-0 break-words text-sm text-muted-foreground lg:col-start-1 lg:row-start-2"
          data-testid="report-period-range"
        >
          Período consultado: {range}
        </p>

        <Button
          type="button"
          onClick={handlePrint}
          disabled={!printable}
          className="min-h-11 w-full sm:w-auto lg:col-start-2 lg:row-start-1 lg:self-end lg:justify-self-end"
        >
          <Printer aria-hidden="true" className="mr-2 h-4 w-4" />
          Generar PDF
        </Button>
      </section>

      {effectiveStatus === "stale" && (
        <div
          role="status"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900"
        >
          El reporte mostrado corresponde a la última consulta válida y puede estar desactualizado.
        </div>
      )}

      {effectiveStatus !== "stale" && !reportVisible && (
        <ReportState status={effectiveStatus} onRetry={onRetry} />
      )}

      {reportVisible && (
        <>
          <header className="hidden border-b border-border pb-5 print:block">
            <p className="font-display text-2xl font-semibold">{businessName}</p>
            <h1 className="mt-2 font-display text-3xl font-semibold">Reporte del negocio</h1>
            <p className="mt-2 text-sm text-muted-foreground" data-testid="report-print-period">
              {range}
            </p>
            {generatedLabel && (
              <p className="mt-1 text-xs text-muted-foreground">Generado: {generatedLabel}</p>
            )}
          </header>

          <section
            aria-label="Resumen financiero"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <MetricCard
              label="Ventas registradas"
              value={formatReportMoney(reportVisible.metrics.salesSubtotal)}
              detail="Sin ITBIS · ventas no anuladas"
              icon={ChartColumnIncreasing}
              featured
            />
            <MetricCard
              label="Gastos operativos"
              value={formatReportMoney(reportVisible.metrics.operatingExpenses)}
              detail="Gastos registrados no anulados"
              icon={Wallet}
            />
            <MetricCard
              label="Compras de mercancía"
              value={formatReportMoney(reportVisible.metrics.merchandisePurchases)}
              detail="Compras no anuladas"
              icon={ShoppingBasket}
            />
            <MetricCard
              label="ITBIS registrado en ventas"
              value={formatReportMoney(reportVisible.metrics.salesTax)}
              detail="Dato informativo · no es impuesto neto a pagar"
              icon={CalendarDays}
            />
          </section>

          {effectiveStatus === "empty" && (
            <p
              role="status"
              className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
            >
              No hay movimientos registrados en este período.
            </p>
          )}

          <section
            className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(19rem,1fr)]"
            aria-label="Gráficos del período"
          >
            <Card className="report-print-chart-card min-w-0 overflow-hidden border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-xl font-semibold">
                  Ventas frente a gastos
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Ventas sin ITBIS y gastos operativos ·{" "}
                  {periodType === "week"
                    ? "por día"
                    : periodType === "month"
                      ? "por semana"
                      : "por mes"}
                </p>
              </CardHeader>
              <CardContent>
                <div
                  role="img"
                  aria-label="Gráfico de barras comparativo de ventas sin ITBIS y gastos operativos"
                  data-testid="report-sales-expenses-chart"
                  className="h-[280px] min-w-0 sm:h-[320px]"
                >
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={8} />
                        <YAxis
                          width={58}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value: number) =>
                            new Intl.NumberFormat("es-DO", {
                              notation: "compact",
                              maximumFractionDigits: 1,
                            }).format(value)
                          }
                        />
                        <Tooltip formatter={(value) => formatChartMoney(value)} />
                        <Legend />
                        <Bar
                          dataKey="salesChartAmount"
                          name="Ventas sin ITBIS"
                          fill="#D4AF37"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={24}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="expensesChartAmount"
                          name="Gastos operativos"
                          fill="#6F8D83"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={24}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-muted-foreground">
                      Sin intervalos para graficar.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="report-print-chart-card min-w-0 overflow-hidden border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-xl font-semibold">
                  Gastos por categoría
                </CardTitle>
                <p className="text-sm text-muted-foreground">Solo gastos registrados no anulados</p>
              </CardHeader>
              <CardContent>
                <div
                  role="img"
                  aria-label="Gráfico de barras horizontales de gastos por categoría"
                  data-testid="report-expense-categories-chart"
                  className="h-[380px] min-w-0 sm:h-[480px]"
                  style={{ minHeight: `${Math.max(380, expenseCategories.length * 30 + 48)}px` }}
                >
                  {expenseCategories.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={expenseCategories}
                        layout="vertical"
                        margin={{ top: 4, right: 14, left: 2, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis
                          type="number"
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value: number) =>
                            new Intl.NumberFormat("es-DO", {
                              notation: "compact",
                              maximumFractionDigits: 1,
                            }).format(value)
                          }
                        />
                        <YAxis
                          type="category"
                          dataKey="displayLabel"
                          width={122}
                          tickLine={false}
                          axisLine={false}
                          interval={0}
                          tick={{ fontSize: 11 }}
                        />
                        <Tooltip formatter={(value) => formatChartMoney(value)} />
                        <Bar
                          dataKey="chartAmount"
                          name="Gastos operativos"
                          fill="#6F8D83"
                          radius={[0, 4, 4, 0]}
                          maxBarSize={18}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-muted-foreground">
                      Sin gastos por categoría en este período.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          <section
            aria-labelledby="report-summary-title"
            className="rounded-xl border border-border/80 bg-card p-5 sm:p-6"
          >
            <h2 id="report-summary-title" className="font-display text-xl font-semibold">
              Resumen del período
            </h2>
            <p
              className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground"
              data-testid="report-summary"
            >
              {buildReportSummary(reportVisible.metrics)}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Este reporte interno es informativo y no constituye un comprobante fiscal ni un
              cálculo de utilidad. Los documentos anulados se excluyen.
            </p>
          </section>

          <p data-testid="report-print-note" className="hidden text-xs print:block">
            Reporte informativo interno. No es un comprobante fiscal ni determina impuestos netos a
            pagar.
          </p>
        </>
      )}
    </div>
  );
}
