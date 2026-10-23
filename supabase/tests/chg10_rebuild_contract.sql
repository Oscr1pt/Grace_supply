DO $contract$
DECLARE
  expected_versions text[] := ARRAY[
    '20261021041426','20261021043648','20261022000000','20261022190000',
    '20261022191000','20261022193000','20261022200000','20261022200500',
    '20261022201000','20261022202000','20261022210000','20261022220000',
    '20261022221000','20261022230000','20261022231000'
  ];
  actual_versions text[];
  public_table_count integer;
  view_count integer;
  public_view_count integer;
  rls_count integer;
  settings_count integer;
  constraint_count integer;
  table_has_rows boolean;
  public_table text;
BEGIN
  SELECT array_agg(version ORDER BY version) INTO actual_versions
  FROM supabase_migrations.schema_migrations;
  IF actual_versions IS DISTINCT FROM expected_versions THEN
    RAISE EXCEPTION 'migration history mismatch: %', actual_versions;
  END IF;

  SELECT count(*) INTO public_table_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p');
  IF public_table_count <> 17 THEN RAISE EXCEPTION 'expected 17 public tables, got %', public_table_count; END IF;

  SELECT count(*) INTO rls_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relrowsecurity;
  IF rls_count <> public_table_count THEN RAISE EXCEPTION 'RLS missing on % of % tables', public_table_count - rls_count, public_table_count; END IF;
  SELECT count(*) INTO constraint_count
  FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public';
  IF constraint_count < 100 THEN RAISE EXCEPTION 'too few public integrity constraints: %', constraint_count; END IF;

  SELECT count(*) INTO view_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v' AND c.relname IN (
    'sales_client_lookup','sales_inventory_lookup','sales_receipt_settings',
    'purchases_supplier_lookup','admin_inventory_catalog'
  ) AND c.reloptions @> ARRAY['security_barrier=true'];
  IF view_count <> 5 THEN RAISE EXCEPTION 'expected five security-barrier lookup views, got %', view_count; END IF;
  SELECT count(*) INTO public_view_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v';
  IF public_view_count <> 5 THEN RAISE EXCEPTION 'unexpected number of public views: %', public_view_count; END IF;
  IF has_table_privilege('anon','public.sales_client_lookup','SELECT')
     OR has_table_privilege('anon','public.sales_inventory_lookup','SELECT')
     OR has_table_privilege('anon','public.sales_receipt_settings','SELECT')
     OR has_table_privilege('anon','public.purchases_supplier_lookup','SELECT')
     OR has_table_privilege('anon','public.admin_inventory_catalog','SELECT') THEN
    RAISE EXCEPTION 'anon received a protected lookup view grant';
  END IF;
  IF NOT has_table_privilege('authenticated','public.sales_client_lookup','SELECT')
     OR NOT has_table_privilege('authenticated','public.sales_inventory_lookup','SELECT')
     OR NOT has_table_privilege('authenticated','public.sales_receipt_settings','SELECT')
     OR NOT has_table_privilege('authenticated','public.purchases_supplier_lookup','SELECT')
     OR NOT has_table_privilege('authenticated','public.admin_inventory_catalog','SELECT') THEN
    RAISE EXCEPTION 'authenticated lookup view grant is missing';
  END IF;

  SELECT count(*) INTO settings_count FROM public.settings;
  IF settings_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.settings
    WHERE id = '00000000-0000-0000-0000-000000000001' AND currency = 'DOP'
      AND tax_policy_approved = false
  ) THEN RAISE EXCEPTION 'required fixed settings singleton missing'; END IF;

  FOR public_table IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'settings'
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I LIMIT 1)', public_table) INTO table_has_rows;
    IF table_has_rows THEN
      RAISE EXCEPTION 'clean migration replay unexpectedly contains data in public.%', public_table;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM auth.users) THEN RAISE EXCEPTION 'clean migration replay contains Auth users'; END IF;

  IF has_table_privilege('anon','public.clients','SELECT')
     OR has_table_privilege('anon','public.settings','SELECT')
     OR has_table_privilege('anon','public.user_profiles','SELECT') THEN
    RAISE EXCEPTION 'anon received direct table read access';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND table_schema = 'public'
      AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
  ) THEN RAISE EXCEPTION 'anon received a public table privilege'; END IF;
  IF NOT has_function_privilege('authenticated','public.post_sale(jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.post_sale(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'financial RPC grants are incorrect';
  END IF;

  IF to_regprocedure('public.post_sale(jsonb)') IS NULL
     OR to_regprocedure('public.post_purchase(jsonb)') IS NULL
     OR to_regprocedure('public.post_credit_payment(jsonb)') IS NULL
     OR to_regprocedure('public.adjust_inventory(jsonb)') IS NULL
     OR to_regprocedure('public.get_business_operation(text,uuid)') IS NULL
     OR to_regprocedure('public.post_expense(jsonb)') IS NULL
     OR to_regprocedure('public.annul_financial_document(jsonb)') IS NULL
     OR to_regprocedure('public.reverse_credit_payment(jsonb)') IS NULL
     OR to_regprocedure('public.require_confirmed_auth_identity()') IS NULL THEN
    RAISE EXCEPTION 'required protected function missing';
  END IF;
  IF has_function_privilege('anon','public.post_purchase(jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.post_credit_payment(jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.adjust_inventory(jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.post_expense(jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.annul_financial_document(jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.reverse_credit_payment(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'anon received a sensitive RPC grant';
  END IF;
END
$contract$;
