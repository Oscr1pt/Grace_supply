export const TAX_CLASSIFICATIONS = Object.freeze(["gravado", "exento", "pendiente"]);
export const TAX_POLICY_STATUSES = Object.freeze(["pending", "approved"]);
export const PROPOSED_ITBIS_RATE = 18;

export function buildTaxPolicyApprovalRequest({ enabled, rate = PROPOSED_ITBIS_RATE, version }) {
  return {
    enabled: Boolean(enabled),
    rate: Number(rate),
    prices_include: false,
    receipt_mode: "internal",
    policy_version: String(version ?? "").trim(),
    approve: true,
  };
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates only a policy that has already been approved by the server.
 * The browser may use this for a preview, but PostgreSQL remains authoritative.
 */
export function calculateSaleTax(lines, policy) {
  if (!policy || policy.status !== "approved") {
    return { status: "blocked", subtotal: 0, tax: 0, total: 0, lines: [] };
  }
  const rate = Number(policy.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100 || policy.pricesInclude !== false) {
    return { status: "unsupported", subtotal: 0, tax: 0, total: 0, lines: [] };
  }
  if (policy.enabled === true && lines.some((line) => line.taxClassification === "pendiente")) {
    return {
      status: "blocked",
      reason: "tax_classification_pending",
      subtotal: 0,
      tax: 0,
      total: 0,
      lines: [],
    };
  }
  const snapshots = lines.map((line) => {
    const subtotal = money(Number(line.unitPrice) * Number(line.quantity));
    const tax =
      policy.enabled === false
        ? 0
        : line.taxClassification === "gravado"
          ? money((subtotal * rate) / 100)
          : 0;
    return { ...line, subtotal, tax };
  });
  const subtotal = money(snapshots.reduce((sum, line) => sum + line.subtotal, 0));
  const tax = money(snapshots.reduce((sum, line) => sum + line.tax, 0));
  return {
    status: "approved",
    taxStatus: policy.enabled === false ? "disabled" : "enabled",
    subtotal,
    tax,
    total: money(subtotal + tax),
    lines: snapshots,
  };
}
