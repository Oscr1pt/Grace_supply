-- CHG-05: Explicit table privileges and active-profile authorization.
-- Financial posting remains closed until the atomic operations in CHG-07.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.has_permission(required_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles p
    JOIN auth.users u ON u.id = p.auth_user_id
    WHERE p.auth_user_id = auth.uid()
      AND p.active
      AND u.email_confirmed_at IS NOT NULL
      AND (p.role = 'admin' OR required_permission = ANY (p.permissions))
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_active_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles p
    JOIN auth.users u ON u.id = p.auth_user_id
    WHERE p.auth_user_id = auth.uid()
      AND p.active AND p.role = 'admin'
      AND u.email_confirmed_at IS NOT NULL
  );
$function$;

CREATE OR REPLACE FUNCTION private.current_profile_username()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
  SELECT p.username
  FROM public.user_profiles p
  JOIN auth.users u ON u.id = p.auth_user_id
  WHERE p.auth_user_id = auth.uid()
    AND p.active AND u.email_confirmed_at IS NOT NULL
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION private.has_permission(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_active_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.current_profile_username() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_active_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_profile_username() TO authenticated;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE USAGE ON SCHEMA public FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA public TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- No direct financial posting or balance changes are granted to authenticated.
GRANT SELECT ON public.clients, public.suppliers TO authenticated;
GRANT INSERT (name, email, phone, phone_secondary, rnc, province, city, address, notes, status)
  ON public.clients TO authenticated;
GRANT UPDATE (name, email, phone, phone_secondary, rnc, province, city, address, notes, status)
  ON public.clients TO authenticated;
GRANT DELETE ON public.clients TO authenticated;
GRANT INSERT (rnc, name, contact_name, phone, phone_secondary, email, province, city, address, notes, status)
  ON public.suppliers TO authenticated;
GRANT UPDATE (rnc, name, contact_name, phone, phone_secondary, email, province, city, address, notes, status)
  ON public.suppliers TO authenticated;
GRANT DELETE ON public.suppliers TO authenticated;
GRANT SELECT ON public.inventory TO authenticated;
GRANT INSERT (sku, kind, name, category, metal, karat, weight_grams, stone,
  stone_carats, stone_cut, stone_clarity, stone_color, size_mm, size_label)
  ON public.inventory TO authenticated;
GRANT UPDATE (sku, kind, name, category, metal, karat, weight_grams, stone,
  stone_carats, stone_cut, stone_clarity, stone_color, size_mm, size_label)
  ON public.inventory TO authenticated;
GRANT SELECT ON public.sales, public.sale_lines TO authenticated;
GRANT SELECT ON public.purchases TO authenticated;
GRANT SELECT ON public.client_credits, public.supplier_credits, public.credit_payments TO authenticated;
GRANT SELECT ON public.expenses, public.settings TO authenticated;
GRANT INSERT (concept, category, description, amount, date, payment_method,
  beneficiary, reference, note) ON public.expenses TO authenticated;
GRANT UPDATE (concept, category, description, amount, date, payment_method,
  beneficiary, reference, note) ON public.expenses TO authenticated;
GRANT UPDATE (business_name, business_address, business_phone, tax_rate, currency,
  label_width_mm, label_height_mm, label_bar_width, label_bar_height, label_show_price)
  ON public.settings TO authenticated;
GRANT SELECT (username, name, role, permissions, active) ON public.user_profiles TO authenticated;

CREATE POLICY clients_read ON public.clients FOR SELECT TO authenticated
  USING (private.has_permission('clients'));
CREATE POLICY clients_insert ON public.clients FOR INSERT TO authenticated
  WITH CHECK (private.has_permission('clients'));
CREATE POLICY clients_update ON public.clients FOR UPDATE TO authenticated
  USING (private.has_permission('clients')) WITH CHECK (private.has_permission('clients'));
CREATE POLICY clients_delete ON public.clients FOR DELETE TO authenticated
  USING (private.has_permission('clients'));

CREATE POLICY suppliers_read ON public.suppliers FOR SELECT TO authenticated
  USING (private.has_permission('suppliers'));
CREATE POLICY suppliers_insert ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (private.has_permission('suppliers'));
CREATE POLICY suppliers_update ON public.suppliers FOR UPDATE TO authenticated
  USING (private.has_permission('suppliers')) WITH CHECK (private.has_permission('suppliers'));
CREATE POLICY suppliers_delete ON public.suppliers FOR DELETE TO authenticated
  USING (private.has_permission('suppliers'));

CREATE POLICY inventory_read ON public.inventory FOR SELECT TO authenticated
  USING (private.has_permission('inventory'));
CREATE POLICY inventory_insert ON public.inventory FOR INSERT TO authenticated
  WITH CHECK (private.has_permission('inventory'));
CREATE POLICY inventory_update ON public.inventory FOR UPDATE TO authenticated
  USING (private.has_permission('inventory')) WITH CHECK (private.has_permission('inventory'));

CREATE POLICY sales_read ON public.sales FOR SELECT TO authenticated
  USING (private.has_permission('sales') OR private.has_permission('clients'));
CREATE POLICY sale_lines_read ON public.sale_lines FOR SELECT TO authenticated
  USING (private.has_permission('sales') OR private.has_permission('clients'));
CREATE POLICY purchases_read ON public.purchases FOR SELECT TO authenticated
  USING (private.has_permission('purchases') OR private.has_permission('suppliers'));
CREATE POLICY client_credits_read ON public.client_credits FOR SELECT TO authenticated
  USING (private.has_permission('clients'));
CREATE POLICY supplier_credits_read ON public.supplier_credits FOR SELECT TO authenticated
  USING (private.has_permission('suppliers') OR private.has_permission('purchases'));
CREATE POLICY credit_payments_read ON public.credit_payments FOR SELECT TO authenticated
  USING (
    (client_credit_id IS NOT NULL AND private.has_permission('clients'))
    OR (supplier_credit_id IS NOT NULL AND
        (private.has_permission('suppliers') OR private.has_permission('purchases')))
  );

CREATE POLICY expenses_read ON public.expenses FOR SELECT TO authenticated
  USING (private.has_permission('expenses'));
CREATE POLICY expenses_insert ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (private.has_permission('expenses'));
CREATE POLICY expenses_update ON public.expenses FOR UPDATE TO authenticated
  USING (private.has_permission('expenses')) WITH CHECK (private.has_permission('expenses'));
ALTER TABLE public.expenses ALTER COLUMN registered_by SET DEFAULT private.current_profile_username();
ALTER TABLE public.expenses ALTER COLUMN updated_at SET DEFAULT now();

CREATE POLICY settings_read ON public.settings FOR SELECT TO authenticated
  USING (private.has_permission('settings'));
CREATE POLICY settings_update ON public.settings FOR UPDATE TO authenticated
  USING (private.is_active_admin()) WITH CHECK (private.is_active_admin());

CREATE POLICY user_profiles_self_or_admin_read ON public.user_profiles FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR private.is_active_admin());

-- Views owned by postgres return only the columns needed for indirect sales lookups.
CREATE VIEW public.sales_client_lookup WITH (security_barrier = true) AS
  SELECT id, name, status FROM public.clients
  WHERE private.has_permission('sales');
CREATE VIEW public.sales_inventory_lookup WITH (security_barrier = true) AS
  SELECT id, sku, name, price, quantity FROM public.inventory
  WHERE private.has_permission('sales') OR private.has_permission('purchases');
CREATE VIEW public.sales_receipt_settings WITH (security_barrier = true) AS
  SELECT id, business_name, business_address, business_phone, tax_rate, currency
  FROM public.settings
  WHERE private.has_permission('sales');
CREATE VIEW public.purchases_supplier_lookup WITH (security_barrier = true) AS
  SELECT id, name, status FROM public.suppliers
  WHERE private.has_permission('purchases');
CREATE VIEW public.admin_inventory_catalog WITH (security_barrier = true) AS
  SELECT id, sku, kind, name, category, metal, karat, weight_grams, stone,
    stone_carats, stone_cut, stone_clarity, stone_color, size_mm, size_label,
    cost_price, price, quantity, created_at
  FROM public.inventory
  WHERE private.is_active_admin();
GRANT SELECT ON public.sales_client_lookup, public.sales_inventory_lookup,
  public.sales_receipt_settings, public.purchases_supplier_lookup,
  public.admin_inventory_catalog TO authenticated;

-- Financial writes and deletes stay closed until CHG-07/08 provides the approved operation.
REVOKE INSERT, UPDATE, DELETE ON public.sales, public.sale_lines, public.purchases,
  public.client_credits, public.supplier_credits, public.credit_payments FROM authenticated;
REVOKE DELETE ON public.expenses FROM authenticated;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'clients','suppliers','inventory','sales','sale_lines','purchases',
    'client_credits','supplier_credits','credit_payments','expenses','settings','user_profiles'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END
$$;

COMMIT;
