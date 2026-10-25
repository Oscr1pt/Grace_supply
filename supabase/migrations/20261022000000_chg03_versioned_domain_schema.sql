
-- CHG-03 clean, versioned Grace Supply domain schema.
-- This migration intentionally creates no imported/test business history.
-- CHG-04 owns the profile/Auth workflow; CHG-05 owns any future client grants.

DO $$
DECLARE
  unexpected_relations text[];
BEGIN
  SELECT array_agg(c.relname ORDER BY c.relname)
    INTO unexpected_relations
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND c.relname NOT IN ('schema_migrations');

  IF unexpected_relations IS NOT NULL THEN
    RAISE EXCEPTION
      'CHG-03 clean baseline precondition failed; public relations already exist: %',
      unexpected_relations;
  END IF;
END
$$;

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  phone_secondary text,
  rnc text,
  province text,
  city text,
  address text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'inactivo')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rnc text NOT NULL DEFAULT '',
  name text NOT NULL,
  contact_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  phone_secondary text,
  email text NOT NULL DEFAULT '',
  province text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'inactivo')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('joya', 'piedra')),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('anillo', 'collar', 'pulsera', 'arete', 'dije', 'reloj', 'piedra', 'otro')),
  metal text,
  karat text,
  weight_grams numeric(10,3) CHECK (weight_grams IS NULL OR weight_grams >= 0),
  stone text,
  stone_carats numeric(10,3) CHECK (stone_carats IS NULL OR stone_carats >= 0),
  stone_cut text,
  stone_clarity text,
  stone_color text,
  size_mm numeric(10,3) CHECK (size_mm IS NULL OR size_mm >= 0),
  size_label text,
  cost_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (cost_price BETWEEN 0 AND 999999999999.99),
  price numeric(14,2) NOT NULL DEFAULT 0 CHECK (price BETWEEN 0 AND 999999999999.99),
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no text NOT NULL UNIQUE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  subtotal numeric(14,2) NOT NULL CHECK (subtotal BETWEEN 0 AND 999999999999.99),
  tax_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  tax numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax BETWEEN 0 AND 999999999999.99),
  total numeric(14,2) NOT NULL CHECK (total BETWEEN 0 AND 999999999999.99),
  payment_type text CHECK (payment_type IS NULL OR payment_type IN ('contado', 'credito')),
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (total = subtotal + tax)
);

-- Sale lines retain catalog and price snapshots even if inventory changes later.
CREATE TABLE public.sale_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  item_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
  sku text NOT NULL,
  name text NOT NULL,
  unit_price numeric(14,2) NOT NULL CHECK (unit_price BETWEEN 0 AND 999999999999.99),
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  item_id uuid REFERENCES public.inventory(id) ON DELETE RESTRICT,
  description text NOT NULL DEFAULT '',
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric(14,2) NOT NULL CHECK (unit_cost BETWEEN 0 AND 999999999999.99),
  total numeric(14,2) NOT NULL CHECK (total BETWEEN 0 AND 999999999999.99),
  payment_type text CHECK (payment_type IS NULL OR payment_type IN ('contado', 'credito')),
  invoice_no text,
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.client_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL UNIQUE REFERENCES public.sales(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  receipt_no text NOT NULL,
  total numeric(14,2) NOT NULL CHECK (total BETWEEN 0 AND 999999999999.99),
  paid numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid BETWEEN 0 AND 999999999999.99),
  balance numeric(14,2) NOT NULL CHECK (balance BETWEEN 0 AND 999999999999.99),
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'parcial', 'pagada', 'vencida')),
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (paid + balance = total)
);

CREATE TABLE public.supplier_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL UNIQUE REFERENCES public.purchases(id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_name text NOT NULL,
  invoice_no text NOT NULL,
  total numeric(14,2) NOT NULL CHECK (total BETWEEN 0 AND 999999999999.99),
  paid numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid BETWEEN 0 AND 999999999999.99),
  balance numeric(14,2) NOT NULL CHECK (balance BETWEEN 0 AND 999999999999.99),
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'parcial', 'pagada', 'vencida')),
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (paid + balance = total)
);

-- Separate nullable FK columns make each payment reference verifiable by PostgreSQL.
CREATE TABLE public.credit_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_credit_id uuid REFERENCES public.client_credits(id) ON DELETE RESTRICT,
  supplier_credit_id uuid REFERENCES public.supplier_credits(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount BETWEEN 0.01 AND 999999999999.99),
  date date NOT NULL DEFAULT CURRENT_DATE,
  method text NOT NULL DEFAULT 'efectivo' CHECK (method IN ('efectivo', 'transferencia', 'tarjeta', 'otro', 'cheque')),
  reference text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(client_credit_id, supplier_credit_id) = 1)
);

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept text NOT NULL,
  category text NOT NULL CHECK (category IN ('nomina', 'alquiler', 'electricidad', 'agua', 'internet', 'telefono', 'transporte', 'combustible', 'mantenimiento', 'papeleria', 'limpieza', 'publicidad', 'servicios_profesionales', 'comisiones', 'impuestos', 'otros')),
  description text NOT NULL DEFAULT '',
  amount numeric(14,2) NOT NULL CHECK (amount BETWEEN 0.01 AND 999999999999.99),
  date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL CHECK (payment_method IN ('efectivo', 'transferencia', 'tarjeta', 'otro', 'cheque')),
  beneficiary text NOT NULL,
  reference text,
  note text,
  status text NOT NULL DEFAULT 'registrado' CHECK (status IN ('registrado', 'anulado')),
  registered_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  business_name text NOT NULL DEFAULT 'GRACE SUPPLY',
  business_address text NOT NULL DEFAULT 'Santo Domingo, República Dominicana',
  business_phone text NOT NULL DEFAULT '+1 (809) 000-0000',
  tax_rate numeric(5,2) NOT NULL DEFAULT 18 CHECK (tax_rate BETWEEN 0 AND 100),
  currency text NOT NULL DEFAULT 'DOP' CHECK (currency = 'DOP'),
  label_width_mm numeric(8,2) NOT NULL DEFAULT 50 CHECK (label_width_mm > 0),
  label_height_mm numeric(8,2) NOT NULL DEFAULT 30 CHECK (label_height_mm > 0),
  label_bar_width numeric(8,2) NOT NULL DEFAULT 2 CHECK (label_bar_width > 0),
  label_bar_height numeric(8,2) NOT NULL DEFAULT 50 CHECK (label_bar_height > 0),
  label_show_price boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (id = '00000000-0000-0000-0000-000000000001'::uuid)
);

-- CHG-04 will populate profiles from newly provisioned Auth identities only.
CREATE TABLE public.user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  username text NOT NULL,
  normalized_username text GENERATED ALWAYS AS (lower(btrim(username))) STORED UNIQUE,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  permissions text[] NOT NULL DEFAULT ARRAY['sales']::text[],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (btrim(username) <> ''),
  CHECK (name <> '')
);

CREATE INDEX sales_client_created_idx ON public.sales (client_id, created_at DESC);
CREATE INDEX sale_lines_sale_idx ON public.sale_lines (sale_id);
CREATE INDEX sale_lines_item_idx ON public.sale_lines (item_id);
CREATE INDEX purchases_supplier_created_idx ON public.purchases (supplier_id, created_at DESC);
CREATE INDEX purchases_item_idx ON public.purchases (item_id) WHERE item_id IS NOT NULL;
CREATE INDEX client_credits_client_status_idx ON public.client_credits (client_id, status);
CREATE INDEX supplier_credits_supplier_status_idx ON public.supplier_credits (supplier_id, status) WHERE supplier_id IS NOT NULL;
CREATE INDEX credit_payments_client_credit_idx ON public.credit_payments (client_credit_id) WHERE client_credit_id IS NOT NULL;
CREATE INDEX credit_payments_supplier_credit_idx ON public.credit_payments (supplier_credit_id) WHERE supplier_credit_id IS NOT NULL;
CREATE INDEX expenses_date_status_idx ON public.expenses (date DESC, status);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

INSERT INTO public.settings (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  relation_count integer;
BEGIN
  SELECT count(*) INTO relation_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND c.relname <> 'schema_migrations';

  IF relation_count <> 12 THEN
    RAISE EXCEPTION 'CHG-03 expected 12 public domain tables, found %', relation_count;
  END IF;
  IF (SELECT count(*) FROM public.settings) <> 1 THEN
    RAISE EXCEPTION 'CHG-03 settings singleton bootstrap failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND c.relname <> 'schema_migrations'
      AND (NOT c.relrowsecurity
        OR has_table_privilege('anon', c.oid, 'SELECT')
        OR has_table_privilege('anon', c.oid, 'INSERT')
        OR has_table_privilege('authenticated', c.oid, 'SELECT')
        OR has_table_privilege('authenticated', c.oid, 'INSERT'))
  ) THEN
    RAISE EXCEPTION 'CHG-03 client role access is not denied by default';
  END IF;
END
$$;
