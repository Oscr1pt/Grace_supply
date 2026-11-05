-- CHG-28: V1 ITBIS settings are saved atomically by an authorized administrator.
-- Forward-only. This does not alter historical sales or the archived CHG-25 migration.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_sales_tax_v1(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE
  v_actor uuid := private.require_business_permission('settings');
  v_enabled boolean := coalesce((p_request->>'tax_calculation_enabled')::boolean, false);
  v_rate numeric(5,2) := coalesce((p_request->>'tax_rate')::numeric, 18);
  v_settings public.settings%ROWTYPE;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'business_operation_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF v_rate <> 18 THEN
    RAISE EXCEPTION 'unsupported_tax_rate' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.sales_tax_v1_write', 'on', true);
  UPDATE public.settings
  SET business_name = coalesce(nullif(btrim(p_request->>'business_name'), ''), business_name),
      business_address = coalesce(nullif(btrim(p_request->>'business_address'), ''), business_address),
      business_phone = coalesce(nullif(btrim(p_request->>'business_phone'), ''), business_phone),
      tax_rate = 18,
      tax_calculation_enabled = v_enabled,
      tax_prices_include = false,
      tax_rounding_policy = 'line_half_up',
      tax_policy_approved = true,
      tax_policy_status = 'approved',
      tax_policy_version = 'chg28-v1-operational',
      tax_policy_approved_at = now(),
      tax_policy_approved_by = v_actor,
      tax_receipt_mode = 'internal',
      updated_at = now()
  WHERE id = '00000000-0000-0000-0000-000000000001'
  RETURNING * INTO STRICT v_settings;

  RETURN to_jsonb(v_settings);
END
$function$;

REVOKE ALL ON FUNCTION public.save_sales_tax_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_sales_tax_v1(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION private.guard_sales_tax_v1_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $guard$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role')
     AND current_setting('app.sales_tax_v1_write', true) IS DISTINCT FROM 'on'
     AND (
       NEW.tax_rate IS DISTINCT FROM OLD.tax_rate
       OR NEW.tax_calculation_enabled IS DISTINCT FROM OLD.tax_calculation_enabled
       OR NEW.tax_prices_include IS DISTINCT FROM OLD.tax_prices_include
       OR NEW.tax_rounding_policy IS DISTINCT FROM OLD.tax_rounding_policy
       OR NEW.tax_policy_approved IS DISTINCT FROM OLD.tax_policy_approved
       OR NEW.tax_policy_status IS DISTINCT FROM OLD.tax_policy_status
       OR NEW.tax_policy_version IS DISTINCT FROM OLD.tax_policy_version
       OR NEW.tax_policy_approved_at IS DISTINCT FROM OLD.tax_policy_approved_at
       OR NEW.tax_policy_approved_by IS DISTINCT FROM OLD.tax_policy_approved_by
       OR NEW.tax_receipt_mode IS DISTINCT FROM OLD.tax_receipt_mode
     )
  THEN
    RAISE EXCEPTION 'sales_tax_policy_write_requires_server_operation' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$guard$;

DROP TRIGGER IF EXISTS guard_sales_tax_v1_update ON public.settings;
CREATE TRIGGER guard_sales_tax_v1_update
  BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION private.guard_sales_tax_v1_update();

GRANT UPDATE (tax_rate, tax_calculation_enabled, tax_prices_include, tax_rounding_policy,
  tax_policy_approved, tax_policy_status, tax_policy_version, tax_policy_approved_at,
  tax_policy_approved_by, tax_receipt_mode) ON public.settings TO authenticated;

COMMIT;
