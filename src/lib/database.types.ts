/**
 * TypeScript contract for CHG-03's versioned PostgreSQL schema.
 * Keep snake_case here to match PostgREST rows; UI models remain camelCase.
 */
export type UUID = string & { readonly __uuid: unique symbol };
export type Numeric = number;

type ForeignKey<
  Name extends string,
  Columns extends string[],
  ReferencedRelation extends string,
  ReferencedColumns extends string[],
  OneToOne extends boolean = false,
> = {
  foreignKeyName: Name;
  columns: Columns;
  isOneToOne: OneToOne;
  referencedRelation: ReferencedRelation;
  referencedColumns: ReferencedColumns;
};

type FK<
  Name extends string,
  Column extends string,
  ReferencedRelation extends string,
  ReferencedColumn extends string = "id",
  OneToOne extends boolean = false,
> = ForeignKey<Name, [Column], ReferencedRelation, [ReferencedColumn], OneToOne>;

type Table<
  Row,
  RequiredOnInsert extends keyof Row,
  Relationships extends unknown[] = [],
  Generated extends keyof Row = never,
> = {
  Row: Row;
  Insert: Pick<Row, RequiredOnInsert> & Partial<Omit<Row, RequiredOnInsert | Generated>>;
  Update: Partial<Omit<Row, Generated>>;
  Relationships: Relationships;
};

type TimestampRow = { id: UUID; created_at: string };

export type Database = {
  public: {
    Tables: {
      clients: Table<TimestampRow & {
        name: string; email: string; phone: string; phone_secondary: string | null;
        rnc: string | null; province: string | null; city: string | null;
        address: string; notes: string; status: "activo" | "inactivo";
      }, "name">;
      suppliers: Table<TimestampRow & {
        rnc: string; name: string; contact_name: string; phone: string;
        phone_secondary: string | null; email: string; province: string; city: string;
        address: string; notes: string; status: "activo" | "inactivo";
      }, "name">;
      inventory: Table<TimestampRow & {
        sku: string; kind: "joya" | "piedra"; name: string;
        category: "anillo" | "collar" | "pulsera" | "arete" | "dije" | "reloj" | "piedra" | "otro";
        metal: string | null; karat: string | null; weight_grams: Numeric | null;
        stone: string | null; stone_carats: Numeric | null; stone_cut: string | null;
        stone_clarity: string | null; stone_color: string | null; size_mm: Numeric | null;
        size_label: string | null; cost_price: Numeric; price: Numeric; quantity: number;
      }, "sku" | "kind" | "name" | "category">;
      sales: Table<TimestampRow & {
        receipt_no: string; client_id: UUID; subtotal: Numeric; tax_rate: Numeric;
        tax: Numeric; total: Numeric; payment_type: "contado" | "credito" | null;
        due_date: string | null; voided_at: string | null; voided_by: UUID | null; void_reason: string | null;
      }, "receipt_no" | "client_id" | "subtotal" | "total", [
        FK<"sales_client_id_fkey", "client_id", "clients">
      ]>;
      sale_lines: Table<TimestampRow & {
        sale_id: UUID; item_id: UUID; sku: string; name: string;
        unit_price: Numeric; quantity: number;
      }, "sale_id" | "item_id" | "sku" | "name" | "unit_price" | "quantity", [
        FK<"sale_lines_sale_id_fkey", "sale_id", "sales">,
        FK<"sale_lines_item_id_fkey", "item_id", "inventory">
      ]>;
      purchases: Table<TimestampRow & {
        supplier: string; supplier_id: UUID | null; item_id: UUID | null;
        description: string; quantity: number; unit_cost: Numeric; total: Numeric;
        payment_type: "contado" | "credito" | null; invoice_no: string | null;
        due_date: string | null; voided_at: string | null; voided_by: UUID | null; void_reason: string | null;
      }, "supplier" | "quantity" | "unit_cost" | "total", [
        FK<"purchases_supplier_id_fkey", "supplier_id", "suppliers">,
        FK<"purchases_item_id_fkey", "item_id", "inventory">
      ]>;
      client_credits: Table<TimestampRow & {
        sale_id: UUID; client_id: UUID; receipt_no: string; total: Numeric;
        paid: Numeric; balance: Numeric; voided_principal: Numeric; status: "pendiente" | "parcial" | "pagada" | "vencida" | "anulada";
        due_date: string | null;
      }, "sale_id" | "client_id" | "receipt_no" | "total" | "balance", [
        FK<"client_credits_sale_id_fkey", "sale_id", "sales", "id", true>,
        FK<"client_credits_client_id_fkey", "client_id", "clients">
      ]>;
      supplier_credits: Table<TimestampRow & {
        purchase_id: UUID; supplier_id: UUID | null; supplier_name: string;
        invoice_no: string; total: Numeric; paid: Numeric; balance: Numeric;
        status: "pendiente" | "parcial" | "pagada" | "vencida" | "anulada"; voided_principal: Numeric; due_date: string | null;
      }, "purchase_id" | "supplier_name" | "invoice_no" | "total" | "balance", [
        FK<"supplier_credits_purchase_id_fkey", "purchase_id", "purchases", "id", true>,
        FK<"supplier_credits_supplier_id_fkey", "supplier_id", "suppliers">
      ]>;
      credit_payments: Table<TimestampRow & {
        client_credit_id: UUID | null; supplier_credit_id: UUID | null;
        amount: Numeric; date: string;
        method: "efectivo" | "transferencia" | "tarjeta" | "otro" | "cheque";
        reference: string | null; note: string | null;
      }, "amount", [
        FK<"credit_payments_client_credit_id_fkey", "client_credit_id", "client_credits">,
        FK<"credit_payments_supplier_credit_id_fkey", "supplier_credit_id", "supplier_credits">
      ]>;
      expenses: Table<TimestampRow & {
        concept: string;
        category: "nomina" | "alquiler" | "electricidad" | "agua" | "internet" | "telefono" | "transporte" | "combustible" | "mantenimiento" | "papeleria" | "limpieza" | "publicidad" | "servicios_profesionales" | "comisiones" | "impuestos" | "otros";
        description: string; amount: Numeric; date: string;
        payment_method: "efectivo" | "transferencia" | "tarjeta" | "otro" | "cheque";
        beneficiary: string; reference: string | null; note: string | null;
        status: "registrado" | "anulado"; registered_by: string; updated_at: string;
        voided_at: string | null; voided_by: UUID | null; void_reason: string | null;
      }, "concept" | "category" | "amount" | "beneficiary" | "registered_by">;
      settings: Table<{
        id: UUID; business_name: string; business_address: string; business_phone: string;
        tax_rate: Numeric; currency: "DOP"; label_width_mm: Numeric;
        label_height_mm: Numeric; label_bar_width: Numeric; label_bar_height: Numeric;
        label_show_price: boolean; updated_at: string;
      }, never>;
      user_profiles: Table<TimestampRow & {
        auth_user_id: UUID; username: string; normalized_username: string;
        name: string; role: "admin" | "employee"; permissions: string[]; active: boolean;
      }, "auth_user_id" | "username" | "name", [
        FK<"user_profiles_auth_user_id_fkey", "auth_user_id", "users", "id", true>
      ], "normalized_username">;
    };
    Views: {
      sales_client_lookup: {
        Row: { id: UUID; name: string; status: "activo" | "inactivo" };
        Relationships: [];
      };
      sales_inventory_lookup: {
        Row: { id: UUID; sku: string; name: string; price: Numeric; quantity: number };
        Relationships: [];
      };
      sales_receipt_settings: {
        Row: { business_name: string; business_address: string; business_phone: string; tax_rate: Numeric; currency: "DOP" };
        Relationships: [];
      };
      purchases_supplier_lookup: {
        Row: { id: UUID; name: string; rnc: string; status: "activo" | "inactivo" };
        Relationships: [];
      };
      admin_inventory_catalog: {
        Row: { id: UUID; sku: string; name: string; price: Numeric; cost_price: Numeric; quantity: number };
        Relationships: [];
      };
    };
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
