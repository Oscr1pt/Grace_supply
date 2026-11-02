export type SalesPolicyState = "unknown" | "blocked" | "unsupported" | "approved";
export function deriveSalesPolicyState({
  data,
  error,
}: {
  data: {
    tax_policy_approved: boolean;
    sales_posting_supported: boolean;
  } | null;
  error: unknown;
}): SalesPolicyState;
