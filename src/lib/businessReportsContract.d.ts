import type { BusinessReportData, ReportPeriod } from "./businessReports";

export function parseBusinessReportResponse(
  value: unknown,
  expectedPeriod: ReportPeriod,
): BusinessReportData;
export function classifyBusinessReportError(
  error: { status?: number; code?: string } | null | undefined,
): "denied" | "error";
