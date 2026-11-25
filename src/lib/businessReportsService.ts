import { supabase } from "./supabase";
import type { BusinessReportData, ReportPeriodType } from "./businessReports";
import {
  classifyBusinessReportError,
  parseBusinessReportResponse,
} from "./businessReportsContract.js";
import { resolveReportPeriod } from "./reportPeriods.js";

type RpcError = { code?: string; message?: string; status?: number };
type ReportsRpcClient = {
  rpc: (
    name: "get_business_report",
    args: { p_period_type: ReportPeriodType; p_anchor_date: string },
  ) => Promise<{ data: unknown; error: RpcError | null }>;
};

export class BusinessReportError extends Error {
  kind: "denied" | "error";

  constructor(kind: "denied" | "error") {
    super(kind === "denied" ? "Report access denied" : "Report could not be loaded");
    this.name = "BusinessReportError";
    this.kind = kind;
  }
}

function rpcAnchor(periodType: ReportPeriodType, anchorDate: string) {
  if (periodType === "month") return `${anchorDate.slice(0, 7)}-01`;
  if (periodType === "year") return `${anchorDate.slice(0, 4)}-01-01`;
  return anchorDate;
}

function expectedPeriod(periodType: ReportPeriodType, anchorDate: string) {
  const anchor = rpcAnchor(periodType, anchorDate);
  const range = resolveReportPeriod(periodType, anchor);
  return {
    type: periodType,
    anchorDate:
      periodType === "month"
        ? anchor.slice(0, 7)
        : periodType === "year"
          ? anchor.slice(0, 4)
          : anchor,
    startDate: range.startDate,
    endDateExclusive: range.endDateExclusive,
  } as const;
}

export async function loadBusinessReport(
  periodType: ReportPeriodType,
  anchorDate: string,
): Promise<{ data: BusinessReportData; status: "ready" | "empty" }> {
  const period = expectedPeriod(periodType, anchorDate);
  const client = supabase as unknown as ReportsRpcClient;
  const { data, error } = await client.rpc("get_business_report", {
    p_period_type: periodType,
    p_anchor_date: rpcAnchor(periodType, anchorDate),
  });
  if (error) throw new BusinessReportError(classifyBusinessReportError(error));

  const report = parseBusinessReportResponse(data, period);
  return { data: report, status: report.hasMovements ? "ready" : "empty" };
}
