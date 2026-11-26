import { PersistenceError, setReadFailure } from "./persistence.js";

export const CLIENT_HISTORY_SALES_FAILURE_KEY = "Historial de ventas de clientes";
export const CLIENT_DELETE_HISTORY_FAILURE_KEY = "Verificación del historial del cliente";

const HISTORY_PAGE_SIZE = 25;
const LINE_PAGE_SIZE = 500;

export function setClientSalesHistoryFailure(message) {
  setReadFailure(CLIENT_HISTORY_SALES_FAILURE_KEY, message);
}

export function setClientDeleteHistoryFailure(message) {
  setReadFailure(CLIENT_DELETE_HISTORY_FAILURE_KEY, message);
}

export async function fetchClientSalesHistoryPage(client, clientId, page, signal) {
  if (!clientId) throw new TypeError("A client ID is required");
  if (!Number.isInteger(page) || page < 0) throw new RangeError("Invalid client history page");

  const start = page * HISTORY_PAGE_SIZE;
  const { data: rows, error } = await client
    .from("sales")
    .select("id,receipt_no,client_id,client_name_snapshot,total,payment_type,created_at,voided_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .abortSignal(signal)
    .range(start, start + HISTORY_PAGE_SIZE);
  if (error) throw error;

  const pageRows = rows ?? [];
  const visibleSales = pageRows.slice(0, HISTORY_PAGE_SIZE);
  const hasMore = pageRows.length > HISTORY_PAGE_SIZE;
  if (visibleSales.length === 0) return { sales: [], hasMore: false };

  const saleIds = visibleSales.map((sale) => sale.id);
  const lines = [];
  for (let offset = 0; ; offset += LINE_PAGE_SIZE) {
    const { data, error: linesError } = await client
      .from("sale_lines")
      .select("sale_id,name,quantity")
      .in("sale_id", saleIds)
      .abortSignal(signal)
      .range(offset, offset + LINE_PAGE_SIZE - 1);
    if (linesError) throw linesError;
    const linePage = data ?? [];
    lines.push(...linePage);
    if (linePage.length < LINE_PAGE_SIZE) break;
  }

  const linesBySale = new Map();
  for (const line of lines) {
    const saleLines = linesBySale.get(line.sale_id) ?? [];
    saleLines.push(line);
    linesBySale.set(line.sale_id, saleLines);
  }

  return {
    sales: visibleSales.map((sale) => ({ ...sale, lines: linesBySale.get(sale.id) ?? [] })),
    hasMore,
  };
}

export async function checkClientHasHistory(client, clientId, signal) {
  if (!clientId) throw new TypeError("A client ID is required");

  const [salesResult, creditsResult] = await Promise.all([
    client
      .from("sales")
      .select("id")
      .eq("client_id", clientId)
      .limit(1)
      .abortSignal(signal)
      .maybeSingle(),
    client
      .from("client_credits")
      .select("id")
      .eq("client_id", clientId)
      .limit(1)
      .abortSignal(signal)
      .maybeSingle(),
  ]);

  if (salesResult.error) throw salesResult.error;
  if (creditsResult.error) throw creditsResult.error;
  for (const result of [salesResult, creditsResult]) {
    if (
      result.data !== null &&
      (typeof result.data !== "object" || typeof result.data.id !== "string")
    ) {
      throw new PersistenceError(
        "service",
        "No se pudo confirmar el historial. Por seguridad, no se permite eliminar el cliente.",
      );
    }
  }
  return Boolean(salesResult.data || creditsResult.data);
}
