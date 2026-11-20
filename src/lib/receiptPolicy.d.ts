export const receiptPolicyCopy: Readonly<{
  thanks: string;
  title: string;
  paragraphs: readonly string[];
}>;

export function isReceiptPolicyApplicable(saleCreatedAt: string, effectiveAt: string): boolean;
