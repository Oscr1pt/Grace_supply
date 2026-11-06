export declare const PROPOSED_ITBIS_RATE: 18;
export declare function calculateSaleTax(
  lines: Array<Record<string, unknown> & {
    unitPrice: number;
    quantity: number;
    taxClassification?: "gravado" | "exento" | "pendiente";
  }>,
  policy: {
    enabled: boolean;
    rate: number;
    pricesInclude: boolean;
    status: "approved" | "pending";
  },
): {
  status: "approved" | "blocked" | "unsupported";
  reason?: string;
  subtotal: number;
  tax: number;
  total: number;
  lines: Array<Record<string, unknown> & { subtotal: number; tax: number }>;
};
