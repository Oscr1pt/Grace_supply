type DashboardSale = {
  total: number;
  paymentType?: "contado" | "credito";
  createdAt: string;
  voidedAt?: string;
};

type DashboardExpense = {
  amount: number;
  date: string;
  status: "registrado" | "anulado";
};

type DashboardInventoryItem = {
  price: number;
  quantity: number;
  isActive: boolean;
};

type DashboardClient = {
  status?: "activo" | "inactivo";
};

export type DashboardMetricData<TSale extends DashboardSale = DashboardSale> = {
  sales: TSale[];
  expenses: DashboardExpense[];
  inventory: DashboardInventoryItem[];
  clients: DashboardClient[];
};

export type DashboardReadState = "loading" | "empty" | "error" | "denied" | "stale" | "ready";

export function getDashboardPeriod(now?: Date): { today: string; month: string };
export function calculateDashboardMetrics<TSale extends DashboardSale>(
  data: DashboardMetricData<TSale>,
  now?: Date,
): {
  period: { today: string; month: string };
  salesTodayCount: number;
  monthSalesCount: number;
  monthSalesAmount: number;
  monthCashSalesAmount: number;
  monthCashSalesCount: number;
  monthCreditSalesCount: number;
  monthUnclassifiedSalesCount: number;
  monthExpenseCount: number;
  monthExpenseAmount: number;
  activeInventoryCount: number;
  inactiveInventoryCount: number;
  estimatedInventorySaleValue: number;
  activeClientCount: number;
  inactiveClientCount: number;
  unknownClientStatusCount: number;
  recentSales: TSale[];
};
export function getDashboardReadState(
  query: {
    data: unknown[];
    loading: boolean;
    stale: boolean;
    loadError?: string | null;
    loadErrorKind?: string | null;
  },
  allowed?: boolean,
): DashboardReadState;
