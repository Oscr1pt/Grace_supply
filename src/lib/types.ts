export type Client = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  createdAt: string;
};

export type ItemKind = "joya" | "piedra";

export type InventoryItem = {
  id: string;
  sku: string; // used as barcode value
  kind: ItemKind; // "joya" full piece, "piedra" loose stone
  name: string;
  category: "anillo" | "collar" | "pulsera" | "arete" | "dije" | "reloj" | "piedra" | "otro";
  metal?: string; // optional for loose stones
  karat?: string; // optional for loose stones
  weightGrams?: number;
  stone?: string;
  stoneCarats?: number;
  stoneCut?: string;
  stoneClarity?: string;
  stoneColor?: string;
  sizeMm?: number;
  sizeLabel?: string;
  costPrice: number;
  price: number;
  quantity: number;
  createdAt: string;
};

export type SaleLine = {
  itemId: string;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

export type Sale = {
  id: string;
  receiptNo: string;
  clientId: string;
  lines: SaleLine[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  createdAt: string;
};

export type Purchase = {
  id: string;
  supplier: string;
  itemId?: string;
  description: string;
  quantity: number;
  unitCost: number;
  total: number;
  createdAt: string;
};

export type Settings = {
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  taxRate: number;
  currency: string;
};
