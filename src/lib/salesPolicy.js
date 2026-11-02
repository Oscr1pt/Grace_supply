export function deriveSalesPolicyState({ data, error }) {
  if (error || !data) return "unknown";
  if (data.tax_policy_approved !== true) return "blocked";
  if (data.sales_posting_supported !== true) return "unsupported";
  return "approved";
}
