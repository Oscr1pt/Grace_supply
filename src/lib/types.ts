export type Client = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  createdAt: string;
};

export type InventoryItem = {
  id: string;
  sku: string; // used as barcode value
  name: string;
  category: "ring" | "necklace" | "bracelet" | "earring" | "pendant" | "watch" | "other";
  metal: string; // e.g. "Yellow Gold"
  karat: string; // e.g. "18K", "925"
  weightGrams: number;
  stone?: string; // e.g. "Diamond"
  stoneCarats?: number;
  stoneCut?: string;
  stoneClarity?: string;
  stoneColor?: string;
  sizeMm?: number; // ring/chain size in mm
  sizeLabel?: string; // e.g. "US 7" or "18 in"
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
  taxRate: number; // percent
  currency: string;
};
