import { getDashboardPeriod } from "./dashboardMetrics.js";

export const DASHBOARD_MONTH_SALES_FAILURE_KEY = "Ventas del mes (Panel General)";
export const DASHBOARD_RECENT_SALES_FAILURE_KEY = "Ventas recientes (Panel General)";

const BUSINESS_TIME_ZONE = "America/Santo_Domingo";
const MONTHLY_PAGE_SIZE = 500;

function localMidnightAsUtc(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let estimate = target;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: BUSINESS_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(estimate));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const represented = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    estimate += target - represented;
  }

  return new Date(estimate).toISOString();
}

export function getDashboardSalesRange(now = new Date()) {
  const { month } = getDashboardPeriod(now);
  return getDashboardSalesRangeForMonth(month);
}

export function getDashboardSalesRangeForMonth(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new RangeError("Invalid dashboard month");
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonth =
    monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
  return {
    start: localMidnightAsUtc(`${month}-01`),
    endExclusive: localMidnightAsUtc(`${nextMonth}-01`),
  };
}

export async function fetchDashboardMonthlySales(client, range, signal) {
  const rows = [];
  for (let offset = 0; ; offset += MONTHLY_PAGE_SIZE) {
    const { data, error } = await client
      .from("sales")
      .select("id,total,payment_type,created_at")
      .is("voided_at", null)
      .gte("created_at", range.start)
      .lt("created_at", range.endExclusive)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .abortSignal(signal)
      .range(offset, offset + MONTHLY_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < MONTHLY_PAGE_SIZE) return rows;
  }
}

export async function fetchRecentDashboardSales(client, signal) {
  const { data, error } = await client
    .from("sales")
    .select("id,receipt_no,client_id,client_name_snapshot,total,payment_type,created_at")
    .is("voided_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(5)
    .abortSignal(signal);
  if (error) throw error;
  return data ?? [];
}

function moneyToCents(value) {
  const text = String(value ?? "0").trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new TypeError("Invalid sale total");
  const [, sign, whole, fraction = ""] = match;
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  const rounded = fraction.length > 2 && Number(fraction[2]) >= 5 ? cents + 1 : cents;
  return sign ? -rounded : rounded;
}

function moneyFromCents(cents) {
  return cents / 100;
}

export function calculateDashboardSalesMetrics(sales, now = new Date()) {
  const period = getDashboardPeriod(now);
  const activeSales = sales.filter((sale) => !sale.voidedAt);
  const cashSales = activeSales.filter((sale) => sale.paymentType === "contado");
  const creditSales = activeSales.filter((sale) => sale.paymentType === "credito");
  const unclassifiedSales = activeSales.filter(
    (sale) => sale.paymentType !== "contado" && sale.paymentType !== "credito",
  );
  const todaySales = activeSales.filter(
    (sale) => getDashboardPeriod(new Date(sale.createdAt)).today === period.today,
  );

  return {
    monthSalesAmount: moneyFromCents(
      activeSales.reduce((sum, sale) => sum + moneyToCents(sale.total), 0),
    ),
    monthSalesCount: activeSales.length,
    monthCashSalesAmount: moneyFromCents(
      cashSales.reduce((sum, sale) => sum + moneyToCents(sale.total), 0),
    ),
    monthCashSalesCount: cashSales.length,
    monthCreditSalesCount: creditSales.length,
    monthUnclassifiedSalesCount: unclassifiedSales.length,
    salesTodayCount: todaySales.length,
  };
}
