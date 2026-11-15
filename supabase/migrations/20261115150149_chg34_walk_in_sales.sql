BEGIN;

-- Preserve existing client UUIDs and foreign-key behavior while allowing a
-- cash sale to retain the counterparty name without creating a client record.
ALTER TABLE public.sales
  ALTER COLUMN client_id DROP NOT NULL,
  ADD COLUMN client_name_snapshot text;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_credit_requires_registered_client
    CHECK (payment_type IS DISTINCT FROM 'credito' OR client_id IS NOT NULL),
  ADD CONSTRAINT sales_walk_in_name_is_valid
    CHECK (
      client_id IS NOT NULL
      OR (
        payment_type = 'contado'
        AND client_name_snapshot IS NOT NULL
        AND client_name_snapshot ~ '[^[:space:]]'
        AND char_length(client_name_snapshot) <= 160
      )
    );

-- Keep the current financial contract intact; only customer resolution and
-- the persisted counterparty snapshot differ for walk-in sales.
CREATE OR REPLACE FUNCTION public.post_sale(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE
  v_actor uuid := private.require_business_permission('sales'); v_op uuid; v_old jsonb;
  v_sale uuid := gen_random_uuid(); v_credit uuid; v_receipt text; v_client public.clients%ROWTYPE;
  v_client_id uuid; v_client_name text;
  v_settings public.settings%ROWTYPE; v_line jsonb; v_item public.inventory%ROWTYPE;
  v_qty integer; v_expected numeric(14,2); v_line_subtotal numeric(14,2); v_line_tax numeric(14,2);
  v_subtotal numeric(14,2):=0; v_tax numeric(14,2):=0; v_total numeric(14,2);
  v_tax_rate numeric(5,2); v_tax_enabled boolean; v_policy_version text;
  v_lines jsonb:='[]'::jsonb; v_stock jsonb:='{}'::jsonb; v_type text; v_result jsonb;
BEGIN
  SELECT operation_id,prior_result INTO v_op,v_old FROM private.reserve_business_operation(v_actor,'sale',p_request);
  IF v_old IS NOT NULL THEN RETURN v_old; END IF;
  v_type := p_request->>'payment_type';
  IF v_type IS NULL OR v_type NOT IN ('contado','credito') THEN
    RAISE EXCEPTION 'invalid_sale_input' USING ERRCODE='22023';
  END IF;
  v_client_id := nullif(btrim(p_request->>'client_id'),'')::uuid;
  v_client_name := nullif(
    regexp_replace(coalesce(p_request->>'walk_in_name',''), '^[[:space:]]+|[[:space:]]+$', '', 'g'),
    ''
  );
  IF (v_client_id IS NULL) = (v_client_name IS NULL) THEN
    RAISE EXCEPTION 'invalid_sale_customer_mode' USING ERRCODE='22023';
  END IF;
  IF v_client_id IS NOT NULL THEN
    SELECT * INTO STRICT v_client FROM public.clients WHERE id=v_client_id FOR UPDATE;
    IF v_client.status <> 'activo' THEN RAISE EXCEPTION 'client_inactive' USING ERRCODE='23514'; END IF;
    v_client_name := v_client.name;
  ELSE
    IF v_type <> 'contado' THEN
      RAISE EXCEPTION 'walk_in_credit_not_allowed' USING ERRCODE='23514';
    END IF;
    IF v_client_name IS NULL OR char_length(v_client_name) > 160 THEN
      RAISE EXCEPTION 'invalid_walk_in_customer_name' USING ERRCODE='22023';
    END IF;
  END IF;
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
  IF v_type IS NULL OR v_type NOT IN ('contado','credito')
     OR jsonb_typeof(p_request->'lines') <> 'array' OR jsonb_array_length(p_request->'lines')=0 THEN
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
    IF (v_line->>'expected_unit_price')::numeric <> v_item.price THEN RAISE EXCEPTION 'catalog_price_conflict' USING ERRCODE='PT409'; END IF;
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
  INSERT INTO public.sales(id,receipt_no,client_id,client_name_snapshot,subtotal,tax_rate,tax,total,payment_type,due_date,
    tax_policy_version,tax_calculation_enabled,tax_receipt_mode)
  VALUES(v_sale,v_receipt,v_client_id,v_client_name,v_subtotal,v_tax_rate,v_tax,v_total,v_type,nullif(p_request->>'due_date','')::date,
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
    VALUES(v_credit,v_sale,v_client_id,v_receipt,v_total,0,v_total,'pendiente',nullif(p_request->>'due_date','')::date);
  END IF;
  v_result:=jsonb_build_object('operation_id',v_op,'sale_id',v_sale,'receipt_no',v_receipt,'client_credit_id',v_credit,
    'client_id',v_client_id,'client_name_snapshot',v_client_name,'payment_type',v_type,'due_date',nullif(p_request->>'due_date',''),'lines',v_lines,
    'subtotal',v_subtotal::text,'tax_rate',v_tax_rate::text,'tax',v_tax::text,'total',v_total::text,'stock',v_stock,
    'tax_policy_version',v_policy_version,'tax_calculation_enabled',v_tax_enabled,'receipt_mode','internal');
  PERFORM private.finish_business_operation(v_op,v_result); RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.search_sales_history(
  p_search text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to_exclusive timestamptz DEFAULT NULL,
  p_page integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_search text;
BEGIN
  IF auth.uid() IS NULL
    OR NOT (private.has_permission('sales') OR private.has_permission('clients')) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authorized_for_sales_history';
  END IF;

  IF p_page IS NULL OR p_page < 1 OR p_page > 1000000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_history_page';
  END IF;
  IF (p_from IS NULL) <> (p_to_exclusive IS NULL) OR
     (p_from IS NOT NULL AND p_from >= p_to_exclusive) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_history_date_range';
  END IF;
  IF p_search IS NOT NULL AND char_length(p_search) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'history_search_too_long';
  END IF;

  v_search := nullif(btrim(p_search), '');

  RETURN (
    WITH filtered AS MATERIALIZED (
      SELECT
        s.id,
        s.receipt_no,
        s.client_id,
        s.client_name_snapshot,
        s.subtotal,
        s.tax_rate,
        s.tax,
        s.total,
        s.payment_type,
        s.due_date,
        s.created_at,
        s.voided_at,
        s.void_reason,
        s.tax_policy_version,
        s.tax_calculation_enabled,
        coalesce(
          s.client_name_snapshot,
          (SELECT c.name FROM public.clients AS c WHERE c.id = s.client_id LIMIT 1),
          (SELECT lookup.name FROM public.sales_client_lookup AS lookup WHERE lookup.id = s.client_id LIMIT 1)
        ) AS client_name,
        coalesce((
          SELECT sum(sl.quantity)::integer
          FROM public.sale_lines AS sl
          WHERE sl.sale_id = s.id
        ), 0)::integer AS piece_count
      FROM public.sales AS s
      WHERE (p_from IS NULL OR s.created_at >= p_from)
        AND (p_to_exclusive IS NULL OR s.created_at < p_to_exclusive)
        AND (
          v_search IS NULL
          OR strpos(lower(s.receipt_no), lower(v_search)) > 0
          OR strpos(lower(s.id::text), lower(v_search)) > 0
          OR strpos(lower(coalesce(s.client_name_snapshot, '')), lower(v_search)) > 0
          OR EXISTS (
            SELECT 1 FROM public.clients AS c
            WHERE c.id = s.client_id
              AND strpos(lower(c.name), lower(v_search)) > 0
          )
          OR EXISTS (
            SELECT 1 FROM public.sales_client_lookup AS lookup
            WHERE lookup.id = s.client_id
              AND strpos(lower(lookup.name), lower(v_search)) > 0
          )
        )
    ),
    counts AS (
      SELECT count(*)::bigint AS total_count FROM filtered
    ),
    page_rows AS (
      SELECT * FROM filtered
      ORDER BY created_at DESC, id DESC
      LIMIT 25 OFFSET ((p_page - 1) * 25)
    ),
    page_json AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'receipt_no', receipt_no,
            'client_id', client_id,
            'client_name_snapshot', client_name_snapshot,
            'client_name', client_name,
            'subtotal', subtotal,
            'tax_rate', tax_rate,
            'tax', tax,
            'total', total,
            'payment_type', payment_type,
            'due_date', due_date,
            'created_at', created_at,
            'voided_at', voided_at,
            'void_reason', void_reason,
            'tax_policy_version', tax_policy_version,
            'tax_calculation_enabled', tax_calculation_enabled,
            'piece_count', piece_count
          ) ORDER BY created_at DESC, id DESC
        ),
        '[]'::jsonb
      ) AS records
      FROM page_rows
    )
    SELECT jsonb_build_object('total_count', counts.total_count, 'records', page_json.records)
    FROM counts CROSS JOIN page_json
  );
END;
$function$;

COMMIT;
