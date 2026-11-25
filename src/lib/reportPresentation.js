const MONEY_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;

function parseMoneyParts(value) {
  if (typeof value !== "string" || !MONEY_PATTERN.test(value)) {
    throw new RangeError("Invalid report amount");
  }
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [wholeText, fractionText = ""] = unsigned.split(".");
  const whole = wholeText.replace(/^0+(?=\d)/, "") || "0";
  const fraction = fractionText.padEnd(2, "0");
  return { negative, whole, fraction };
}

export function formatReportMoney(value) {
  const { negative, whole, fraction } = parseMoneyParts(value);
  const grouped = new Intl.NumberFormat("es-DO", {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(BigInt(whole));
  return `RD$ ${negative ? "-" : ""}${grouped}.${fraction}`;
}

export function buildReportSummary({ salesSubtotal, operatingExpenses }) {
  return `Durante este período se registraron ventas por ${formatReportMoney(salesSubtotal)} sin ITBIS y gastos operativos por ${formatReportMoney(operatingExpenses)}. Las compras de mercancía y el ITBIS registrado se presentan por separado; los documentos anulados no se incluyen.`;
}

export function toChartAmount(value) {
  const { negative, whole, fraction } = parseMoneyParts(value);
  const amount = Number(`${negative ? "-" : ""}${whole}.${fraction}`);
  if (!Number.isFinite(amount)) throw new RangeError("Invalid report amount");
  return amount;
}
