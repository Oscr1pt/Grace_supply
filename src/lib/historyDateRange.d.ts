export type HistoryPeriod = "all" | "today" | "last7Days" | "thisMonth" | "custom";

export type HistoryDateRange = {
  fromInclusive: string | null;
  toExclusive: string | null;
};

export class HistoryDateRangeError extends Error {}

export function resolveHistoryDateRange(input?: {
  period: HistoryPeriod;
  now?: string | number | Date;
  from?: string;
  to?: string;
}): HistoryDateRange;
