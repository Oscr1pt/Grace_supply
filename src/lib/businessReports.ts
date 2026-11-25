export type ReportPeriodType = "week" | "month" | "year";

export type ReportPeriod = {
  type: ReportPeriodType;
  /** Selector elegido: YYYY-MM-DD para semana, YYYY-MM para mes, YYYY para año. */
  anchorDate: string;
  startDate: string;
  endDateExclusive: string;
};

export type ReportMoney = string;

export type BusinessReportBucket = {
  startDate: string;
  label: string;
  salesSubtotal: ReportMoney;
  operatingExpenses: ReportMoney;
};

export type BusinessReportExpenseCategory = {
  category: string;
  label: string;
  amount: ReportMoney;
};

export type BusinessReportData = {
  period: ReportPeriod;
  generatedAt: string;
  hasMovements: boolean;
  metrics: {
    salesSubtotal: ReportMoney;
    operatingExpenses: ReportMoney;
    merchandisePurchases: ReportMoney;
    salesTax: ReportMoney;
  };
  buckets: BusinessReportBucket[];
  expenseCategories: BusinessReportExpenseCategory[];
};

export type BusinessReportStatus =
  "integration-pending" | "loading" | "ready" | "empty" | "error" | "denied" | "stale";
