import { supabase } from "./supabase";
import type { BusinessReportData, ReportPeriodType } from "./businessReports";
import {
  classifyBusinessReportError,
  parseBusinessReportResponse,
} from "./businessReportsContract.js";
import { buildBusinessReportRequest } from "./businessReportRequest.js";

type RpcError = { code?: string; message?: string; status?: number };
type ReportsRpcClient = {
  rpc: (
    name: "get_business_report",
    args: { p_period_type: ReportPeriodType; p_anchor_date: string },
  ) => Promise<{ data: unknown; error: RpcError | null }>;
};

export class BusinessReportError extends Error {
  kind: "denied" | "error" | "invalid-period";

  constructor(kind: "denied" | "error" | "invalid-period") {
    super(
      kind === "denied"
        ? "Report access denied"
        : kind === "invalid-period"
          ? "Report period is invalid"
          : "Report could not be loaded",
    );
    this.name = "BusinessReportError";
    this.kind = kind;
  }
}

export async function loadBusinessReport(
  periodType: ReportPeriodType,
  anchorDate: string,
): Promise<{ data: BusinessReportData; status: "ready" | "empty" }> {
  const client = supabase as unknown as ReportsRpcClient;
  let request;
  try {
    request = buildBusinessReportRequest(periodType, anchorDate);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "INVALID_REPORT_PERIOD") {
      throw new BusinessReportError("invalid-period");
    }
    throw error;
  }
  const { data, error } = await client.rpc("get_business_report", request.args);
  if (error) throw new BusinessReportError(classifyBusinessReportError(error));

  const report = parseBusinessReportResponse(data, request.expectedPeriod);
  return { data: report, status: report.hasMovements ? "ready" : "empty" };
}
