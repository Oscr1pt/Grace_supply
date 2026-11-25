const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d+(?:\.\d{1,2})?$/;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Invalid business report ${label}`);
  }
  return value;
}

function date(value, label) {
  if (
    typeof value !== "string" ||
    !DATE.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  ) {
    throw new TypeError(`Invalid business report ${label}`);
  }
  if (new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new TypeError(`Invalid business report ${label}`);
  }
  return value;
}

function addUtcDays(value, days) {
  const result = new Date(`${value}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function expectedBucketDates(period) {
  const starts = [];
  if (period.type === "week") {
    for (let day = 0; day < 7; day += 1) starts.push(addUtcDays(period.startDate, day));
  } else if (period.type === "year") {
    for (let month = 0; month < 12; month += 1) {
      starts.push(`${period.startDate.slice(0, 4)}-${String(month + 1).padStart(2, "0")}-01`);
    }
  } else if (period.type === "month") {
    const start = new Date(`${period.startDate}T00:00:00Z`);
    const dayOfWeek = (start.getUTCDay() + 6) % 7;
    let bucket = addUtcDays(period.startDate, -dayOfWeek);
    while (bucket < period.endDateExclusive) {
      starts.push(bucket < period.startDate ? period.startDate : bucket);
      bucket = addUtcDays(bucket, 7);
    }
  }
  return starts;
}

function money(value, label) {
  if (typeof value !== "string" || !MONEY.test(value)) {
    throw new TypeError(`Invalid business report amount ${label}`);
  }
  return value;
}

function cents(value) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function totalCents(items, key) {
  return items.reduce((sum, item) => sum + cents(item[key]), 0n);
}

export function parseBusinessReportResponse(value, expectedPeriod) {
  const root = object(value, "response");
  const period = object(root.period, "period");
  const expected = object(expectedPeriod, "expected period");
  for (const key of ["type", "anchorDate", "startDate", "endDateExclusive"]) {
    if (period[key] !== expected[key])
      throw new TypeError(`Business report period mismatch: ${key}`);
  }
  date(period.startDate, "period start");
  date(period.endDateExclusive, "period end");
  if (
    Date.parse(`${period.endDateExclusive}T00:00:00Z`) <=
    Date.parse(`${period.startDate}T00:00:00Z`)
  ) {
    throw new TypeError("Invalid business report period range");
  }

  const generatedAt = root.generatedAt;
  if (typeof generatedAt !== "string" || !Number.isFinite(Date.parse(generatedAt))) {
    throw new TypeError("Invalid business report generation date");
  }
  if (typeof root.hasMovements !== "boolean")
    throw new TypeError("Invalid business report movement flag");

  const metrics = object(root.metrics, "metrics");
  const parsedMetrics = {
    salesSubtotal: money(metrics.salesSubtotal, "sales subtotal"),
    operatingExpenses: money(metrics.operatingExpenses, "operating expenses"),
    merchandisePurchases: money(metrics.merchandisePurchases, "merchandise purchases"),
    salesTax: money(metrics.salesTax, "sales tax"),
  };

  const maxBuckets =
    period.type === "week" ? 7 : period.type === "month" ? 6 : period.type === "year" ? 12 : 0;
  const bucketDates = expectedBucketDates(period);
  if (!maxBuckets || !Array.isArray(root.buckets) || root.buckets.length !== bucketDates.length) {
    throw new TypeError("Invalid business report buckets");
  }
  const buckets = root.buckets.map((item, index) => {
    const bucket = object(item, "bucket");
    if (typeof bucket.label !== "string" || bucket.label.length > 60)
      throw new TypeError("Invalid business report bucket label");
    const startDate = date(bucket.startDate, "bucket date");
    if (startDate !== bucketDates[index]) throw new TypeError("Incomplete business report buckets");
    return {
      startDate,
      label: bucket.label,
      salesSubtotal: money(bucket.salesSubtotal, "bucket sales"),
      operatingExpenses: money(bucket.operatingExpenses, "bucket expenses"),
    };
  });

  if (!Array.isArray(root.expenseCategories) || root.expenseCategories.length > 32) {
    throw new TypeError("Invalid business report expense categories");
  }
  const expenseCategories = root.expenseCategories.map((item) => {
    const category = object(item, "expense category");
    if (
      typeof category.category !== "string" ||
      category.category.length > 80 ||
      typeof category.label !== "string" ||
      category.label.length > 100
    ) {
      throw new TypeError("Invalid business report expense category");
    }
    return {
      category: category.category,
      label: category.label,
      amount: money(category.amount, "category"),
    };
  });
  if (
    new Set(expenseCategories.map(({ category }) => category)).size !== expenseCategories.length
  ) {
    throw new TypeError("Duplicate business report expense category");
  }
  if (
    totalCents(buckets, "salesSubtotal") !== cents(parsedMetrics.salesSubtotal) ||
    totalCents(buckets, "operatingExpenses") !== cents(parsedMetrics.operatingExpenses) ||
    totalCents(expenseCategories, "amount") !== cents(parsedMetrics.operatingExpenses)
  ) {
    throw new TypeError("Inconsistent business report aggregates");
  }
  if (
    !root.hasMovements &&
    (Object.values(parsedMetrics).some((amount) => cents(amount) !== 0n) ||
      expenseCategories.length > 0)
  )
    throw new TypeError("Inconsistent empty business report");

  return {
    period: {
      type: period.type,
      anchorDate: period.anchorDate,
      startDate: period.startDate,
      endDateExclusive: period.endDateExclusive,
    },
    generatedAt,
    hasMovements: root.hasMovements,
    metrics: parsedMetrics,
    buckets,
    expenseCategories,
  };
}

export function classifyBusinessReportError(error) {
  if (error?.status === 401 || error?.status === 403 || error?.code === "42501") return "denied";
  return "error";
}
