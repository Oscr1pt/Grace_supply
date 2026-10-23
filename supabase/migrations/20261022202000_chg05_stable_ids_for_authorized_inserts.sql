-- CHG-01 creates stable client-side IDs so a write with a lost response can
-- be reconciled by the same identifier without blindly repeating the insert.
-- RLS still decides whether the caller may create a row in each domain.
GRANT INSERT (id) ON public.clients, public.suppliers, public.inventory, public.expenses
  TO authenticated;

-- IDs are immutable through the API. No UPDATE privilege is added here.
REVOKE UPDATE (id) ON public.clients, public.suppliers, public.inventory, public.expenses
  FROM authenticated;
