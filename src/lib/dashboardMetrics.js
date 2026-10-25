const BUSINESS_TIME_ZONE = "America/Santo_Domingo";

function datePartsInZone(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

export function getDashboardPeriod(now = new Date()) {
  const { year, month, day } = datePartsInZone(now);
  return { today: `${year}-${month}-${day}`, month: `${year}-${month}` };
}

export function calculateDashboardMetrics(data, now = new Date()) {
  const period = getDashboardPeriod(now);
  const activeSales = data.sales.filter((sale) => !sale.voidedAt);
  const monthSales = activeSales.filter(
    (sale) => getDashboardPeriod(new Date(sale.createdAt)).month === period.month,
  );
  const monthCashSales = monthSales.filter((sale) => sale.paymentType === "contado");
  const monthCreditSales = monthSales.filter((sale) => sale.paymentType === "credito");
  const monthUnclassifiedSales = monthSales.filter(
    (sale) => sale.paymentType !== "contado" && sale.paymentType !== "credito",
  );
  const monthExpenses = data.expenses.filter(
    (expense) => expense.status === "registrado" && expense.date.slice(0, 7) === period.month,
  );
  const activeInventory = data.inventory.filter((item) => item.isActive);
  const inactiveInventoryCount = data.inventory.filter((item) => !item.isActive).length;

  return {
    period,
    salesTodayCount: activeSales.filter(
      (sale) => getDashboardPeriod(new Date(sale.createdAt)).today === period.today,
    ).length,
    monthSalesCount: monthSales.length,
    monthSalesAmount: monthSales.reduce((total, sale) => total + Number(sale.total), 0),
    monthCashSalesAmount: monthCashSales.reduce((total, sale) => total + Number(sale.total), 0),
    monthCashSalesCount: monthCashSales.length,
    monthCreditSalesCount: monthCreditSales.length,
    monthUnclassifiedSalesCount: monthUnclassifiedSales.length,
    monthExpenseCount: monthExpenses.length,
    monthExpenseAmount: monthExpenses.reduce((total, expense) => total + Number(expense.amount), 0),
    activeInventoryCount: activeInventory.length,
    inactiveInventoryCount,
    estimatedInventorySaleValue: activeInventory.reduce(
      (total, item) => total + Number(item.price) * Number(item.quantity),
      0,
    ),
    activeClientCount: data.clients.filter((client) => client.status === "activo").length,
    inactiveClientCount: data.clients.filter((client) => client.status === "inactivo").length,
    unknownClientStatusCount: data.clients.filter(
      (client) => client.status !== "activo" && client.status !== "inactivo",
    ).length,
    recentSales: [...activeSales]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 5),
  };
}

export function getDashboardReadState(query, allowed = true) {
  if (!allowed || query.loadErrorKind === "denied") return "denied";
  if (query.loading && query.data.length === 0) return "loading";
  if (query.loadError && query.data.length > 0) return "stale";
  if (query.loading && query.stale && query.data.length > 0) return "stale";
  if (query.loadError) return "error";
  if (query.data.length === 0) return query.stale ? "error" : "empty";
  return "ready";
}
