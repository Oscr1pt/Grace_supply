-- CHG-25: store the proposed tax policy without treating it as approval.
-- Forward-only and intentionally fail-closed: existing sales remain unchanged.
BEGIN;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS tax_calculation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_policy_status text NOT NULL DEFAULT 'pending'
    CHECK (tax_policy_status IN ('pending', 'approved')),
  ADD COLUMN IF NOT EXISTS tax_policy_version text,
  ADD COLUMN IF NOT EXISTS tax_policy_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS tax_policy_approved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS tax_receipt_mode text NOT NULL DEFAULT 'internal'
    CHECK (tax_receipt_mode = 'internal');

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS tax_classification text NOT NULL DEFAULT 'pendiente'
    CHECK (tax_classification IN ('gravado', 'exento', 'pendiente'));

-- An approval must carry a version, actor and timestamp. Pending remains the safe default.
ALTER TABLE public.settings
  DROP CONSTRAINT IF EXISTS settings_tax_policy_approval_evidence,
  ADD CONSTRAINT settings_tax_policy_approval_evidence CHECK (
    tax_policy_status = 'pending'
    OR (
      tax_policy_status = 'approved'
      AND tax_policy_approved_by IS NOT NULL
      AND tax_policy_approved_at IS NOT NULL
      AND nullif(btrim(tax_policy_version), '') IS NOT NULL
    )
  );

-- Keep direct authenticated edits away from approval evidence and policy status.
REVOKE UPDATE (tax_policy_status, tax_policy_version, tax_policy_approved_at,
  tax_policy_approved_by, tax_receipt_mode) ON public.settings FROM authenticated;

COMMIT;

BEGIN;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS tax_policy_version text,
  ADD COLUMN IF NOT EXISTS tax_calculation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_receipt_mode text NOT NULL DEFAULT 'internal'
    CHECK (tax_receipt_mode = 'internal');

ALTER TABLE public.sale_lines
  ADD COLUMN IF NOT EXISTS tax_classification text NOT NULL DEFAULT 'pendiente'
    CHECK (tax_classification IN ('gravado', 'exento', 'pendiente')),
  ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS tax numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax BETWEEN 0 AND 999999999999.99);

CREATE OR REPLACE FUNCTION public.approve_sales_tax_policy(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE
  v_actor uuid := private.require_business_permission('settings');
  v_approve boolean := coalesce((p_request->>'approve')::boolean, false);
  v_enabled boolean := coalesce((p_request->>'enabled')::boolean, false);
  v_rate numeric(5,2) := coalesce((p_request->>'rate')::numeric, 18);
  v_version text := nullif(btrim(p_request->>'policy_version'), '');
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'business_operation_not_authorized' USING ERRCODE='42501';
  END IF;
  IF v_approve AND v_version IS NULL THEN
    RAISE EXCEPTION 'tax_policy_version_required' USING ERRCODE='22023';
  END IF;
  IF v_rate < 0 OR v_rate > 100 OR (v_enabled AND v_rate <> 18) THEN
    RAISE EXCEPTION 'unsupported_tax_rate' USING ERRCODE='22023';
  END IF;
  IF coalesce((p_request->>'prices_include')::boolean, false) THEN
    RAISE EXCEPTION 'inclusive_tax_policy_not_implemented' USING ERRCODE='55000';
  END IF;
  UPDATE public.settings
  SET tax_calculation_enabled = CASE WHEN v_approve THEN v_enabled ELSE false END,
      tax_rate = v_rate,
      tax_prices_include = false,
      tax_rounding_policy = 'line_half_up',
      tax_policy_approved = v_approve,
      tax_policy_status = CASE WHEN v_approve THEN 'approved' ELSE 'pending' END,
      tax_policy_version = CASE WHEN v_approve THEN v_version ELSE NULL END,
      tax_policy_approved_at = CASE WHEN v_approve THEN now() ELSE NULL END,
      tax_policy_approved_by = CASE WHEN v_approve THEN auth.uid() ELSE NULL END,
      tax_receipt_mode = 'internal',
      updated_at = now()
  WHERE id = '00000000-0000-0000-0000-000000000001';
  RETURN jsonb_build_object(
    'approved', v_approve,
    'enabled', CASE WHEN v_approve THEN v_enabled ELSE false END,
    'rate', v_rate::text,
    'policy_version', CASE WHEN v_approve THEN v_version ELSE NULL END,
    'receipt_mode', 'internal'
  );
END
$function$;

REVOKE ALL ON FUNCTION public.approve_sales_tax_policy(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_sales_tax_policy(jsonb) TO authenticated;

DROP VIEW IF EXISTS public.sales_posting_status;
CREATE VIEW public.sales_posting_status WITH (security_barrier = true) AS
  SELECT
    s.tax_policy_approved,
    coalesce(
      s.tax_policy_approved
        AND s.tax_policy_status = 'approved'
        AND s.tax_policy_version IS NOT NULL
        AND s.tax_prices_include = false
        AND s.tax_rounding_policy = 'line_half_up'
        AND s.tax_receipt_mode = 'internal'
        AND ((s.tax_calculation_enabled = false) OR s.tax_rate = 18),
      false
    ) AS sales_posting_supported
  FROM public.settings AS s
  WHERE s.id = '00000000-0000-0000-0000-000000000001'
    AND private.has_permission('sales');

GRANT SELECT ON public.sales_posting_status TO authenticated;

CREATE OR REPLACE FUNCTION public.post_sale(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE
  v_actor uuid := private.require_business_permission('sales'); v_op uuid; v_old jsonb;
  v_sale uuid := gen_random_uuid(); v_credit uuid; v_receipt text; v_client public.clients%ROWTYPE;
  v_settings public.settings%ROWTYPE; v_line jsonb; v_item public.inventory%ROWTYPE;
  v_qty integer; v_expected numeric(14,2); v_line_subtotal numeric(14,2); v_line_tax numeric(14,2);
  v_subtotal numeric(14,2):=0; v_tax numeric(14,2):=0; v_total numeric(14,2);
  v_tax_rate numeric(5,2); v_tax_enabled boolean; v_policy_version text;
  v_lines jsonb:='[]'::jsonb; v_stock jsonb:='{}'::jsonb; v_type text; v_result jsonb;
BEGIN
  SELECT operation_id,prior_result INTO v_op,v_old FROM private.reserve_business_operation(v_actor,'sale',p_request);
  IF v_old IS NOT NULL THEN RETURN v_old; END IF;
  SELECT * INTO STRICT v_client FROM public.clients WHERE id=(p_request->>'client_id')::uuid FOR UPDATE;
  IF v_client.status <> 'activo' THEN RAISE EXCEPTION 'client_inactive' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT v_settings FROM public.settings WHERE id='00000000-0000-0000-0000-000000000001';
  IF NOT v_settings.tax_policy_approved OR v_settings.tax_policy_status <> 'approved'
     OR v_settings.tax_policy_version IS NULL OR v_settings.tax_rounding_policy <> 'line_half_up'
     OR v_settings.tax_prices_include IS DISTINCT FROM false OR v_settings.tax_receipt_mode <> 'internal' THEN
    RAISE EXCEPTION 'financial_tax_policy_pending' USING ERRCODE='55000';
  END IF;
  v_tax_enabled := coalesce(v_settings.tax_calculation_enabled, false);
  v_tax_rate := CASE WHEN v_tax_enabled THEN v_settings.tax_rate ELSE 0 END;
  v_policy_version := v_settings.tax_policy_version;
  v_type := p_request->>'payment_type';
  IF v_type NOT IN ('contado','credito') OR jsonb_typeof(p_request->'lines') <> 'array' OR jsonb_array_length(p_request->'lines')=0 THEN
    RAISE EXCEPTION 'invalid_sale_input' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_request->'lines') x GROUP BY (x->>'item_id') HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'duplicate_sale_item_lines' USING ERRCODE='22023';
  END IF;
  PERFORM i.id FROM public.inventory i JOIN (
    SELECT (x->>'item_id')::uuid id FROM jsonb_array_elements(p_request->'lines') x GROUP BY 1
  ) requested ON requested.id=i.id ORDER BY i.id FOR UPDATE OF i;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_request->'lines') LOOP
    v_qty := (v_line->>'quantity')::integer;
    IF v_qty <= 0 THEN RAISE EXCEPTION 'invalid_sale_quantity' USING ERRCODE='22023'; END IF;
    IF NOT (v_line ? 'expected_unit_price') THEN RAISE EXCEPTION 'sale_quote_required' USING ERRCODE='22023'; END IF;
    SELECT * INTO STRICT v_item FROM public.inventory WHERE id=(v_line->>'item_id')::uuid;
    IF NOT v_item.is_active THEN RAISE EXCEPTION 'inventory_item_inactive' USING ERRCODE='23514'; END IF;
    IF (v_line->>'expected_unit_price')::numeric <> v_item.price THEN RAISE EXCEPTION 'catalog_price_conflict' USING ERRCODE='40001'; END IF;
    IF v_item.quantity < v_qty THEN RAISE EXCEPTION 'insufficient_stock' USING ERRCODE='23514'; END IF;
    IF v_tax_enabled AND v_item.tax_classification = 'pendiente' THEN
      RAISE EXCEPTION 'tax_classification_pending' USING ERRCODE='55000';
    END IF;
    IF v_item.tax_classification NOT IN ('gravado','exento','pendiente') THEN
      RAISE EXCEPTION 'invalid_tax_classification' USING ERRCODE='22023';
    END IF;
    v_expected := v_item.price;
    v_line_subtotal := (v_expected * v_qty)::numeric(14,2);
    v_line_tax := CASE WHEN v_tax_enabled AND v_item.tax_classification = 'gravado'
      THEN round(v_line_subtotal * v_tax_rate / 100, 2) ELSE 0 END;
    v_subtotal := v_subtotal + v_line_subtotal;
    v_tax := v_tax + v_line_tax;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'item_id',v_item.id,'sku',v_item.sku,'name',v_item.name,'unit_price',v_expected::text,
      'quantity',v_qty,'tax_classification',v_item.tax_classification,'tax_rate',v_tax_rate::text,'tax',v_line_tax::text));
    v_stock := v_stock || jsonb_build_object(v_item.id::text,v_item.quantity-v_qty);
  END LOOP;
  v_subtotal := v_subtotal::numeric(14,2); v_tax := v_tax::numeric(14,2); v_total := (v_subtotal + v_tax)::numeric(14,2);
  v_receipt := 'GS-'||upper(substr(replace(v_sale::text,'-',''),1,12));
  INSERT INTO public.sales(id,receipt_no,client_id,subtotal,tax_rate,tax,total,payment_type,due_date,
    tax_policy_version,tax_calculation_enabled,tax_receipt_mode)
  VALUES(v_sale,v_receipt,v_client.id,v_subtotal,v_tax_rate,v_tax,v_total,v_type,nullif(p_request->>'due_date','')::date,
    v_policy_version,v_tax_enabled,'internal');
  INSERT INTO public.sale_lines(sale_id,item_id,sku,name,unit_price,quantity,tax_classification,tax_rate,tax)
    SELECT v_sale,(x->>'item_id')::uuid,x->>'sku',x->>'name',(x->>'unit_price')::numeric,(x->>'quantity')::integer,
      x->>'tax_classification',(x->>'tax_rate')::numeric,(x->>'tax')::numeric
    FROM jsonb_array_elements(v_lines) x;
  PERFORM set_config('grace.business_operation','sale',true);
  UPDATE public.inventory i SET quantity=(x.value)::integer FROM jsonb_each_text(v_stock) x WHERE i.id=x.key::uuid;
  IF v_type='credito' THEN
    v_credit:=gen_random_uuid();
    INSERT INTO public.client_credits(id,sale_id,client_id,receipt_no,total,paid,balance,status,due_date)
    VALUES(v_credit,v_sale,v_client.id,v_receipt,v_total,0,v_total,'pendiente',nullif(p_request->>'due_date','')::date);
  END IF;
  v_result:=jsonb_build_object('operation_id',v_op,'sale_id',v_sale,'receipt_no',v_receipt,'client_credit_id',v_credit,
    'client_id',v_client.id,'payment_type',v_type,'due_date',nullif(p_request->>'due_date',''),'lines',v_lines,
    'subtotal',v_subtotal::text,'tax_rate',v_tax_rate::text,'tax',v_tax::text,'total',v_total::text,'stock',v_stock,
    'tax_policy_version',v_policy_version,'tax_calculation_enabled',v_tax_enabled,'receipt_mode','internal');
  PERFORM private.finish_business_operation(v_op,v_result); RETURN v_result;
END
$function$;

REVOKE ALL ON FUNCTION public.post_sale(jsonb), public.approve_sales_tax_policy(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_sale(jsonb), public.approve_sales_tax_policy(jsonb) TO authenticated;

COMMIT;
