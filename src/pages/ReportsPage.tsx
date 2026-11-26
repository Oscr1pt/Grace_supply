import { useEffect, useState } from "react";
import { ReportsDashboard } from "@/components/reports/ReportsDashboard";
import type {
  BusinessReportData,
  BusinessReportStatus,
  ReportPeriodType,
} from "@/lib/businessReports";
import { BusinessReportError, loadBusinessReport } from "@/lib/businessReportsService";
import { validateReportPeriodSelection } from "@/lib/reportPeriods.js";

const BUSINESS_TIME_ZONE = "America/Santo_Domingo";

function currentBusinessDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return values.year + "-" + values.month + "-" + values.day;
}

export function ReportsPage() {
  const [periodType, setPeriodType] = useState<ReportPeriodType>("week");
  const [anchorDate, setAnchorDate] = useState(currentBusinessDate);
  const [status, setStatus] = useState<BusinessReportStatus>("loading");
  const [data, setData] = useState<BusinessReportData>();
  const [requestRevision, setRequestRevision] = useState(0);

  useEffect(() => {
    let currentRequest = true;
    const selection = validateReportPeriodSelection(periodType, anchorDate);
    if (!selection.valid) {
      setStatus("invalid-period");
      setData(undefined);
      return () => {
        currentRequest = false;
      };
    }

    setStatus("loading");
    setData(undefined);

    void loadBusinessReport(periodType, selection.selectorValue).then(
      (result) => {
        if (!currentRequest) return;
        setData(result.data);
        setStatus(result.status);
      },
      (error: unknown) => {
        if (!currentRequest) return;
        setData(undefined);
        setStatus(error instanceof BusinessReportError ? error.kind : "error");
      },
    );

    return () => {
      currentRequest = false;
    };
  }, [periodType, anchorDate, requestRevision]);

  function changePeriodType(next: ReportPeriodType) {
    setPeriodType(next);
    const today = currentBusinessDate();
    setAnchorDate(
      next === "month" ? today.slice(0, 7) : next === "year" ? today.slice(0, 4) : today,
    );
  }

  return (
    <ReportsDashboard
      status={status}
      data={data}
      businessName="Grace Supply"
      periodType={periodType}
      anchorDate={anchorDate}
      onPeriodTypeChange={changePeriodType}
      onAnchorDateChange={setAnchorDate}
      onRetry={() => setRequestRevision((revision) => revision + 1)}
    />
  );
}
