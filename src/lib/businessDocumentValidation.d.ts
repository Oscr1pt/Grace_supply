type LookupProduct = { id: string; price: number; quantity: number };
type LookupParty = { id: string; status: string };
type SaleDraftInput = {
  customerMode?: "registered" | "occasional";
  clientId: string;
  walkInName?: string;
  clients: LookupParty[];
  lines: Array<{ itemId: string; unitPrice: number; quantity: number; name: string }>;
  inventory: LookupProduct[];
  paymentType: "contado" | "credito";
  dueDate: string;
};
type PurchaseDraftInput = {
  supplierId: string;
  supplierName: string;
  suppliers: LookupParty[];
  paymentType: "contado" | "credito";
  invoiceNo: string;
  dueDate: string;
  description: string;
  itemId?: string;
  inventory: LookupProduct[];
  quantity?: number;
  unitCost?: number;
  restock: boolean;
  quickPurchase?: boolean;
  lines?: Array<
    | { key?: string; kind: "linked"; itemId: string; quantity: number; unitCost: number }
    | { key?: string; kind: "manual"; manualName: string; quantity: number; unitCost: number }
  >;
};
export type PurchaseLineFieldErrors = Record<
  string,
  Partial<Record<"manualName" | "itemId" | "quantity" | "unitCost", string>>
>;
export type PurchaseDraftErrors = Partial<
  Record<
    | "supplierName"
    | "supplierId"
    | "invoiceNo"
    | "dueDate"
    | "lines"
    | "description"
    | "quantity"
    | "unitCost"
    | "itemId"
    | "restock",
    string
  >
> & { lineErrors?: PurchaseLineFieldErrors };
export function calculatePurchaseTotalCents(
  lines: Array<{ quantity: number; unitCost: number }>,
): number;
export function validateSaleDraft(input: SaleDraftInput): Record<string, string>;
export function validatePurchaseDraft(input: PurchaseDraftInput): PurchaseDraftErrors;
