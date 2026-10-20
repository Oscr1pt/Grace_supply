-- ==============================================================================
-- MIGRACIÓN DE BASE DE DATOS SUPABASE: GRACE SUPPLY (PROVEEDORES Y CRÉDITOS)
-- ==============================================================================

-- 1. TABLA DE PROVEEDORES (suppliers)
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rnc TEXT DEFAULT '',
  name TEXT NOT NULL,
  contact_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  phone_secondary TEXT DEFAULT '',
  email TEXT DEFAULT '',
  province TEXT DEFAULT '',
  city TEXT DEFAULT '',
  address TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'activo',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TABLA DE CUENTAS POR COBRAR - CRÉDITOS DE CLIENTES (client_credits)
CREATE TABLE IF NOT EXISTS public.client_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id TEXT DEFAULT '',
  client_id TEXT NOT NULL,
  receipt_no TEXT NOT NULL,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'pendiente',
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABLA DE CUENTAS POR PAGAR - CRÉDITOS DE PROVEEDORES (supplier_credits)
CREATE TABLE IF NOT EXISTS public.supplier_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id TEXT DEFAULT '',
  supplier_id TEXT DEFAULT '',
  supplier_name TEXT NOT NULL,
  invoice_no TEXT NOT NULL,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'pendiente',
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TABLA DE REGISTRO DE PAGOS / COBROS DE CRÉDITOS (credit_payments)
CREATE TABLE IF NOT EXISTS public.credit_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id TEXT NOT NULL,
  credit_type TEXT NOT NULL, -- 'client' O 'supplier'
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  method TEXT NOT NULL DEFAULT 'efectivo',
  reference TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- HABILITAR RLS Y PERMISOS PÚBLICOS DE LECTURA/ESCRITURA (ANON ROLE)
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir todo en suppliers" ON public.suppliers FOR ALL USING (true);
CREATE POLICY "Permitir todo en client_credits" ON public.client_credits FOR ALL USING (true);
CREATE POLICY "Permitir todo en supplier_credits" ON public.supplier_credits FOR ALL USING (true);
CREATE POLICY "Permitir todo en credit_payments" ON public.credit_payments FOR ALL USING (true);
