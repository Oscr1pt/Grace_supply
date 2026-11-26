import type { ReportPeriodType, ReportPeriod } from "./businessReports";

type ReportRpcArgs = { p_period_type: ReportPeriodType; p_anchor_date: string };
type ReportRpcResponse = {
  data: unknown;
  error: { code?: string; message?: string; status?: number } | null;
};

export function buildBusinessReportRequest(
  periodType: ReportPeriodType,
  selectorValue: string,
  currentYear?: number,
): { expectedPeriod: ReportPeriod; args: ReportRpcArgs };

export function invokeBusinessReportRpc(
  rpc: (name: "get_business_report", args: ReportRpcArgs) => Promise<ReportRpcResponse>,
  periodType: ReportPeriodType,
  selectorValue: string,
  currentYear?: number,
): Promise<{
  expectedPeriod: ReportPeriod;
  args: ReportRpcArgs;
  response: ReportRpcResponse;
}>;
