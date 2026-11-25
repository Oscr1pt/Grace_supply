-- Synthetic contract test for CHG Reportes. Run only against a fresh disposable
-- Supabase local database. All fixture writes are rolled back at the end.
BEGIN;

DO $setup$
DECLARE
  v_admin constant uuid := 'a5000000-0000-4000-8000-000000000001';
  v_employee constant uuid := 'a5000000-0000-4000-8000-000000000002';
  v_client constant uuid := 'a5000000-0000-4000-8000-000000000003';
  v_admin_b constant uuid := 'a5000000-0000-4000-8000-000000000004';
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id IN (v_admin, v_employee, v_admin_b))
     OR EXISTS (SELECT 1 FROM public.clients WHERE id = v_client) THEN
    RAISE EXCEPTION 'reports fixture identifiers already exist; use a fresh isolated database';
  END IF;

  INSERT INTO auth.users(id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'reports-admin@example.test', '', statement_timestamp(), '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
    (v_employee, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'reports-employee@example.test', '', statement_timestamp(), '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
    (v_admin_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'reports-admin-secondary@example.test', '', statement_timestamp(), '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp());

  INSERT INTO public.user_profiles(auth_user_id, username, name, role, permissions, active)
  VALUES
    (v_admin, 'reports-admin-synthetic', 'Synthetic reports administrator', 'admin', ARRAY[]::text[], true),
    (v_employee, 'reports-employee-synthetic', 'Synthetic reports employee', 'employee', ARRAY['sales','purchases','expenses']::text[], true),
    (v_admin_b, 'reports-admin-secondary-synthetic', 'Synthetic secondary reports administrator', 'admin', ARRAY[]::text[], true);

  INSERT INTO public.clients(id, name) VALUES (v_client, 'Synthetic reports client');

  -- This claim is only for allowed local fixture setup; the report function itself is
  -- subsequently invoked with authenticated and anon roles below.
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  INSERT INTO public.sales(id, receipt_no, client_id, subtotal, tax_rate, tax, total, payment_type, created_at, voided_at)
  VALUES
    ('a5000000-0000-4000-8000-000000000011', 'GS-REPORTS-ACTIVE-1', v_client, 100, 18, 18, 118, 'contado', '2026-11-16T04:00:00Z', NULL),
    ('a5000000-0000-4000-8000-000000000012', 'GS-REPORTS-ACTIVE-2', v_client, 50, 18, 9, 59, 'credito', '2026-11-23T03:59:59Z', NULL),
    ('a5000000-0000-4000-8000-000000000013', 'GS-REPORTS-OUTSIDE', v_client, 7, 18, 1.26, 8.26, 'contado', '2026-11-23T04:00:00Z', NULL),
    ('a5000000-0000-4000-8000-000000000014', 'GS-REPORTS-VOID', v_client, 200, 18, 36, 236, 'contado', '2026-11-20T16:00:00Z', statement_timestamp());

  INSERT INTO public.client_credits(id, sale_id, client_id, receipt_no, total, paid, balance, status)
  VALUES ('a5000000-0000-4000-8000-000000000021', 'a5000000-0000-4000-8000-000000000012', v_client,
    'GS-REPORTS-ACTIVE-2', 59, 20, 39, 'parcial');
  INSERT INTO public.credit_payments(client_credit_id, amount, date, method)
  VALUES ('a5000000-0000-4000-8000-000000000021', 20, '2026-11-20', 'efectivo');

  INSERT INTO public.purchases(id, supplier, description, quantity, unit_cost, total, payment_type, created_at, voided_at)
  VALUES
    ('a5000000-0000-4000-8000-000000000031', 'Synthetic supplier', 'Active purchase', 1, 30, 30, 'contado', '2026-11-20T16:00:00Z', NULL),
    ('a5000000-0000-4000-8000-000000000032', 'Synthetic supplier', 'Voided purchase', 1, 70, 70, 'contado', '2026-11-20T16:00:00Z', statement_timestamp());

  INSERT INTO public.expenses(id, concept, category, amount, date, payment_method, beneficiary, registered_by, status, voided_at)
  VALUES
    ('a5000000-0000-4000-8000-000000000041', 'Payroll fixture', 'nomina', 10, '2026-11-16', 'efectivo', 'Synthetic', 'reports-test', 'registrado', NULL),
    ('a5000000-0000-4000-8000-000000000042', 'Transport fixture', 'transporte', 5, '2026-11-22', 'efectivo', 'Synthetic', 'reports-test', 'registrado', NULL),
    ('a5000000-0000-4000-8000-000000000043', 'Voided fixture', 'otros', 100, '2026-11-20', 'efectivo', 'Synthetic', 'reports-test', 'anulado', statement_timestamp());
END
$setup$;

DO $money_columns_nonnull$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('sales'::text, 'subtotal'::text),
      ('sales', 'tax'),
      ('purchases', 'total'),
      ('expenses', 'amount')
    ) AS required(table_name, column_name)
    LEFT JOIN information_schema.columns AS column_info
      ON column_info.table_schema = 'public'
     AND column_info.table_name = required.table_name
     AND column_info.column_name = required.column_name
    WHERE column_info.is_nullable IS DISTINCT FROM 'NO'
  ) THEN
    RAISE EXCEPTION 'financial amount columns must remain NOT NULL; historical null amounts are not representable';
  END IF;
END
$money_columns_nonnull$;
DO $acl$
BEGIN
  IF has_function_privilege('anon', 'public.get_business_report(text,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon unexpectedly has EXECUTE on the report RPC';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_business_report(text,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated is missing EXECUTE on the report RPC';
  END IF;
END
$acl$;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true);
DO $anonymous$
BEGIN
  BEGIN
    PERFORM public.get_business_report('week', DATE '2026-11-19');
    RAISE EXCEPTION 'anonymous RPC invocation unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$anonymous$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '', true);
DO $no_session$
BEGIN
  BEGIN
    PERFORM public.get_business_report('week', DATE '2026-11-19');
    RAISE EXCEPTION 'RPC invocation without a session unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$no_session$;

SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000002', true);
DO $employee$
BEGIN
  BEGIN
    PERFORM public.get_business_report('week', DATE '2026-11-19');
    RAISE EXCEPTION 'employee RPC invocation unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$employee$;

SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
DO $admin_report$
DECLARE
  v_report jsonb;
  v_month jsonb;
  v_year jsonb;
BEGIN
  v_report := public.get_business_report('week', DATE '2026-11-19');
  IF v_report #>> '{period,startDate}' <> '2026-11-16'
     OR v_report #>> '{period,endDateExclusive}' <> '2026-11-23' THEN
    RAISE EXCEPTION 'week range is incorrect';
  END IF;
  IF v_report #>> '{metrics,salesSubtotal}' <> '150.00'
     OR v_report #>> '{metrics,salesTax}' <> '27.00'
     OR v_report #>> '{metrics,operatingExpenses}' <> '15.00'
     OR v_report #>> '{metrics,merchandisePurchases}' <> '30.00' THEN
    RAISE EXCEPTION 'report totals do not match expected non-voided fixture amounts: %', v_report->'metrics';
  END IF;
  IF jsonb_array_length(v_report->'buckets') <> 7
     OR jsonb_array_length(v_report->'expenseCategories') <> 2
     OR v_report #>> '{expenseCategories,0,amount}' <> '10.00'
     OR v_report #>> '{expenseCategories,1,amount}' <> '5.00' THEN
    RAISE EXCEPTION 'week buckets or expense categories are incorrect';
  END IF;

  v_month := public.get_business_report('month', DATE '2026-02-18');
  IF v_month #>> '{period,startDate}' <> '2026-02-01'
     OR v_month #>> '{period,endDateExclusive}' <> '2026-03-01'
     OR jsonb_array_length(v_month->'buckets') <> 5
     OR v_month #>> '{hasMovements}' <> 'false'
     OR v_month #>> '{metrics,salesSubtotal}' <> '0.00' THEN
    RAISE EXCEPTION 'monthly range or partial-week buckets are incorrect';
  END IF;

  v_year := public.get_business_report('year', DATE '2026-12-31');
  IF v_year #>> '{period,startDate}' <> '2026-01-01'
     OR v_year #>> '{period,endDateExclusive}' <> '2027-01-01'
     OR jsonb_array_length(v_year->'buckets') <> 12 THEN
    RAISE EXCEPTION 'annual range or month buckets are incorrect';
  END IF;

  v_month := public.get_business_report('week', DATE '2026-03-01');
  IF v_month #>> '{period,startDate}' <> '2026-02-23'
     OR v_month #>> '{period,endDateExclusive}' <> '2026-03-02'
     OR jsonb_array_length(v_month->'buckets') <> 7 THEN
    RAISE EXCEPTION 'week crossing a month boundary is incorrect';
  END IF;

  v_year := public.get_business_report('week', DATE '2027-01-01');
  IF v_year #>> '{period,startDate}' <> '2026-12-28'
     OR v_year #>> '{period,endDateExclusive}' <> '2027-01-04'
     OR jsonb_array_length(v_year->'buckets') <> 7 THEN
    RAISE EXCEPTION 'week crossing a year boundary is incorrect';
  END IF;

  BEGIN
    PERFORM public.get_business_report('quarter', DATE '2026-11-19');
    RAISE EXCEPTION 'unsupported report period unexpectedly succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
END
$admin_report$;
RESET ROLE;

UPDATE public.user_profiles SET active = false
WHERE auth_user_id = 'a5000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
DO $revoked$
BEGIN
  BEGIN
    PERFORM public.get_business_report('week', DATE '2026-11-19');
    RAISE EXCEPTION 'inactive admin RPC invocation unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$revoked$;
RESET ROLE;

-- Keep an independent active administrator to prove that the RPC remains usable.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000004', true);
DO $active_admin_b$
DECLARE
  v_report jsonb;
BEGIN
  v_report := public.get_business_report('week', DATE '2026-11-19');
  IF v_report #>> '{metrics,salesSubtotal}' <> '150.00' THEN
    RAISE EXCEPTION 'the remaining active administrator lost report access';
  END IF;
END
$active_admin_b$;
RESET ROLE;

-- The last-admin protection must still reject revoking administrator B.
DO $last_admin_guard$
BEGIN
  BEGIN
    UPDATE public.user_profiles SET active = false
    WHERE auth_user_id = 'a5000000-0000-4000-8000-000000000004';
    RAISE EXCEPTION 'last active administrator was unexpectedly deactivated';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'The last active administrator cannot be revoked or demoted' THEN
      RAISE;
    END IF;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE auth_user_id = 'a5000000-0000-4000-8000-000000000004'
      AND role = 'admin' AND active
  ) THEN
    RAISE EXCEPTION 'last-admin guard did not preserve the active administrator';
  END IF;
END
$last_admin_guard$;

-- The STABLE RPC and the read-only function contract must leave its fixture rows intact.
DO $no_writes$
BEGIN
  IF (SELECT count(*) FROM public.sales WHERE id BETWEEN
      'a5000000-0000-4000-8000-000000000011'::uuid AND 'a5000000-0000-4000-8000-000000000014'::uuid) <> 4
     OR (SELECT count(*) FROM public.purchases WHERE id BETWEEN
      'a5000000-0000-4000-8000-000000000031'::uuid AND 'a5000000-0000-4000-8000-000000000032'::uuid) <> 2
     OR (SELECT count(*) FROM public.expenses WHERE id BETWEEN
      'a5000000-0000-4000-8000-000000000041'::uuid AND 'a5000000-0000-4000-8000-000000000043'::uuid) <> 3 THEN
    RAISE EXCEPTION 'report RPC modified financial fixtures';
  END IF;
END
$no_writes$;

ROLLBACK;
