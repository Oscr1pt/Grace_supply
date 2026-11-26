export type ReportPeriodResolution = {
  startDate: string;
  endDateExclusive: string;
  bucketCount: number;
};

export type ReportPeriodSelection = {
  valid: boolean;
  anchorDate: string | null;
  selectorValue: string;
  error: string | null;
};

export function getCurrentBusinessYear(now?: Date): number;

export function validateReportPeriodSelection(
  periodType: "week" | "month" | "year",
  value: string,
  currentYear?: number,
): ReportPeriodSelection;

export function resolveReportPeriod(
  periodType: "week" | "month" | "year",
  anchorDate: string,
): ReportPeriodResolution;

export function formatReportPeriodRange(
  startDate: string,
  endDateExclusive: string,
  locale?: string,
): string;
