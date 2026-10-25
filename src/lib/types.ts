export type Client = {
  id: string;
  name: string;
  email: string;
  phone: string;
  phoneSecondary?: string;
  rnc?: string;
  province?: string;
  city?: string;
  address: string;
  notes: string;
  status?: "activo" | "inactivo";
  createdAt: string;
};

export type Supplier = {
  id: string;
  rnc: string;
  name: string; // Razón Social / Nombre
  contactName: string;
  phone: string;
  phoneSecondary?: string;
  email: string;
  province: string;
  city: string;
  address: string;
  notes: string;
  status: "activo" | "inactivo";
  createdAt: string;
};

export type InventoryItem = {
  id: string;
  sku: string;
  /** Legacy discriminator retained only to read old rows during migration. */
  kind?: string;
  name: string;
  description: string;
  category: string;
  brand: string | null;
  presentation: string | null;
  unit: string | null;
  attributes: Record<string, unknown>;
  isActive: boolean;
  /** Legacy jewelry columns remain readable until a separately approved cleanup. */
  metal?: string | null;
  karat?: string | null;
  weightGrams?: number | null;
  stone?: string | null;
  stoneCarats?: number | null;
  stoneCut?: string | null;
  stoneClarity?: string | null;
  stoneColor?: string | null;
  sizeMm?: number | null;
  sizeLabel?: string | null;
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
  paymentType?: "contado" | "credito";
  dueDate?: string;
  createdAt: string;
  voidedAt?: string;
  voidReason?: string;
};

export type Purchase = {
  id: string;
  supplier: string;
  supplierId?: string;
  itemId?: string;
  description: string;
  quantity: number;
  unitCost: number;
  total: number;
  paymentType?: "contado" | "credito";
  invoiceNo?: string;
  dueDate?: string;
  createdAt: string;
  voidedAt?: string;
  voidReason?: string;
};

export type CreditStatus = "pendiente" | "parcial" | "pagada" | "vencida" | "anulada";
export type PaymentMethod = "efectivo" | "transferencia" | "tarjeta" | "otro" | "cheque";

export type ClientCredit = {
  id: string;
  saleId: string;
  clientId: string;
  receiptNo: string;
  total: number;
  paid: number;
  balance: number;
  status: CreditStatus;
  dueDate?: string;
  createdAt: string;
};

export type SupplierCredit = {
  id: string;
  purchaseId: string;
  supplierId?: string;
  supplierName: string;
  invoiceNo: string;
  total: number;
  paid: number;
  balance: number;
  status: CreditStatus;
  dueDate?: string;
  createdAt: string;
};

type CreditPaymentBase = {
  id: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  createdAt: string;
};

export type CreditPayment = CreditPaymentBase & (
  | { clientCreditId: string; supplierCreditId?: never }
  | { supplierCreditId: string; clientCreditId?: never }
);

export type ExpenseCategory =
  | "nomina"
  | "alquiler"
  | "electricidad"
  | "agua"
  | "internet"
  | "telefono"
  | "transporte"
  | "combustible"
  | "mantenimiento"
  | "papeleria"
  | "limpieza"
  | "publicidad"
  | "servicios_profesionales"
  | "comisiones"
  | "impuestos"
  | "otros";

export type ExpenseStatus = "registrado" | "anulado";

export type Expense = {
  id: string;
  concept: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  date: string;
  paymentMethod: PaymentMethod | "cheque";
  beneficiary: string;
  reference?: string;
  note?: string;
  status: ExpenseStatus;
  registeredBy: string;
  createdAt: string;
  updatedAt?: string;
};

export type Settings = {
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  taxRate: number;
  currency: "DOP";
  /** Printed label size in millimeters */
  labelWidthMm: number;
  labelHeightMm: number;
  /** Barcode bar thickness and bar height (px) */
  labelBarWidth: number;
  labelBarHeight: number;
  labelShowPrice: boolean;
};
