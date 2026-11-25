export type ReportPeriodResolution = {
  startDate: string;
  endDateExclusive: string;
  bucketCount: number;
};

export function resolveReportPeriod(
  periodType: "week" | "month" | "year",
  anchorDate: string,
): ReportPeriodResolution;

export function formatReportPeriodRange(
  startDate: string,
  endDateExclusive: string,
  locale?: string,
): string;
