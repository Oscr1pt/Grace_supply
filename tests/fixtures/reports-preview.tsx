import "../../src/styles.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ReportsDashboard,
  type BusinessReportStatus,
  type ReportPeriodType,
} from "../../src/components/reports/ReportsDashboard";
import { resolveReportPeriod } from "../../src/lib/reportPeriods.js";
import type { BusinessReportData } from "../../src/lib/businessReports";

function localDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function createSyntheticReport(
  type: ReportPeriodType,
  anchorDate: string,
  empty = false,
): BusinessReportData {
  const range = resolveReportPeriod(type, anchorDate);
  const start = new Date(`${range.startDate}T00:00:00.000Z`);
  const end = new Date(`${range.endDateExclusive}T00:00:00.000Z`);
  const buckets: BusinessReportData["buckets"] = [];

  if (type === "week") {
    for (let cursor = new Date(start); cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      buckets.push({
        startDate: localDate(cursor),
        label: new Intl.DateTimeFormat("es-DO", { timeZone: "UTC", weekday: "short" }).format(
          cursor,
        ),
        salesSubtotal: empty ? "0.00" : "12000.00",
        operatingExpenses: empty ? "0.00" : "2500.00",
      });
    }
  } else if (type === "month") {
    const cursor = new Date(start);
    cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));
    while (cursor < end) {
      buckets.push({
        startDate: localDate(cursor),
        label: `Semana ${buckets.length + 1}`,
        salesSubtotal: empty ? "0.00" : "24000.00",
        operatingExpenses: empty ? "0.00" : "5000.00",
      });
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  } else {
    for (let month = 0; month < 12; month += 1) {
      const cursor = new Date(Date.UTC(start.getUTCFullYear(), month, 1));
      buckets.push({
        startDate: localDate(cursor),
        label: new Intl.DateTimeFormat("es-DO", { timeZone: "UTC", month: "short" }).format(cursor),
        salesSubtotal: empty ? "0.00" : "85000.00",
        operatingExpenses: empty ? "0.00" : "18000.00",
      });
    }
  }

  return {
    period: {
      type,
      anchorDate:
        type === "month"
          ? anchorDate.slice(0, 7)
          : type === "year"
            ? anchorDate.slice(0, 4)
            : anchorDate,
      startDate: range.startDate,
      endDateExclusive: range.endDateExclusive,
    },
    generatedAt: "2026-11-23T14:00:00.000Z",
    metrics: {
      salesSubtotal: empty ? "0.00" : "85000.00",
      operatingExpenses: empty ? "0.00" : "18000.00",
      merchandisePurchases: empty ? "0.00" : "32000.00",
      salesTax: empty ? "0.00" : "15300.00",
    },
    buckets,
    expenseCategories: empty
      ? []
      : [
          { category: "nomina", label: "Nómina", amount: "9000.00" },
          { category: "alquiler", label: "Alquiler", amount: "5000.00" },
          { category: "electricidad", label: "Electricidad", amount: "1200.00" },
          { category: "agua", label: "Agua", amount: "250.00" },
          { category: "internet", label: "Internet", amount: "600.00" },
          { category: "telefono", label: "Teléfono", amount: "300.00" },
          { category: "transporte", label: "Transporte", amount: "500.00" },
          { category: "combustible", label: "Combustible", amount: "200.00" },
          { category: "mantenimiento", label: "Mantenimiento", amount: "100.00" },
          { category: "papeleria", label: "Papelería", amount: "50.00" },
          { category: "limpieza", label: "Limpieza", amount: "100.00" },
          { category: "publicidad", label: "Publicidad", amount: "400.00" },
          {
            category: "servicios_profesionales",
            label: "Servicios profesionales",
            amount: "300.00",
          },
          { category: "comisiones", label: "Comisiones", amount: "700.00" },
          { category: "impuestos", label: "Impuestos", amount: "250.00" },
          { category: "otros", label: "Otros gastos operativos", amount: "350.00" },
        ],
  };
}

export function Preview() {
  const [type, setType] = useState<ReportPeriodType>("week");
  const [anchorDate, setAnchorDate] = useState("2026-11-18");
  const [status, setStatus] = useState<BusinessReportStatus>("ready");
  const data =
    status === "ready" || status === "empty"
      ? createSyntheticReport(type, anchorDate, status === "empty")
      : undefined;

  return (
    <div className="min-h-screen bg-background p-3 text-foreground sm:p-6">
      <nav className="no-print" data-testid="preview-navigation">
        Synthetic navigation
      </nav>
      <p
        data-testid="synthetic-preview-notice"
        className="reports-no-print mx-auto mb-4 max-w-7xl rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800"
      >
        Vista de prueba: todos los importes son datos sintéticos.
      </p>
      <div
        data-testid="reports-preview-controls"
        className="reports-no-print mx-auto mb-4 flex max-w-7xl flex-wrap gap-2"
      >
        <button type="button" onClick={() => setStatus("loading")}>
          Preview: carga
        </button>
        <button type="button" onClick={() => setStatus("error")}>
          Preview: error
        </button>
        <button type="button" onClick={() => setStatus("denied")}>
          Preview: denegado
        </button>
        <button type="button" onClick={() => setStatus("empty")}>
          Preview: vacío
        </button>
      </div>
      <ReportsDashboard
        status={status}
        data={data}
        businessName="Grace Supply"
        periodType={type}
        anchorDate={anchorDate}
        onPeriodTypeChange={(next) => {
          setType(next);
          setAnchorDate(
            next === "month" ? "2026-11-01" : next === "year" ? "2026-01-01" : "2026-11-18",
          );
        }}
        onAnchorDateChange={setAnchorDate}
        onRetry={() => setStatus("ready")}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
