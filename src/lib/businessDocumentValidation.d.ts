type LookupProduct = { id: string; price: number; quantity: number };
type LookupParty = { id: string; status: string };
type SaleDraftInput = {
  clientId: string;
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
  itemId: string;
  inventory: LookupProduct[];
  quantity: number;
  unitCost: number;
  restock: boolean;
};
export function validateSaleDraft(input: SaleDraftInput): Record<string, string>;
export function validatePurchaseDraft(input: PurchaseDraftInput): Record<string, string>;
