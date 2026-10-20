-- ==============================================================================
-- MIGRACIÓN DE BASE DE DATOS SUPABASE: GRACE SUPPLY (MÓDULO DE GASTOS)
-- ==============================================================================

-- 1. TABLA DE GASTOS (expenses)
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL DEFAULT 'transferencia',
  beneficiary TEXT NOT NULL,
  reference TEXT DEFAULT '',
  note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'registrado', -- 'registrado' O 'anulado'
  registered_by TEXT NOT NULL DEFAULT 'Administrador',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- HABILITAR RLS Y PERMISOS PÚBLICOS DE LECTURA/ESCRITURA (ANON ROLE)
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir todo en expenses" ON public.expenses FOR ALL USING (true);
