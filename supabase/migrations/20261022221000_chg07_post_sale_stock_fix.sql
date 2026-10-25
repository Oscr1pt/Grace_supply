BEGIN;
CREATE OR REPLACE FUNCTION public.post_sale(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE
  v_actor uuid := private.require_business_permission('sales'); v_op uuid; v_old jsonb;
  v_sale uuid := gen_random_uuid(); v_credit uuid; v_receipt text; v_client public.clients%ROWTYPE;
  v_settings public.settings%ROWTYPE; v_line jsonb; v_item public.inventory%ROWTYPE;
  v_qty integer; v_expected numeric(14,2); v_subtotal numeric(14,2):=0; v_tax numeric(14,2):=0; v_total numeric(14,2);
  v_tax_rate numeric(5,2); v_lines jsonb:='[]'::jsonb; v_stock jsonb:='{}'::jsonb; v_type text; v_result jsonb;
BEGIN
  SELECT operation_id,prior_result INTO v_op,v_old FROM private.reserve_business_operation(v_actor,'sale',p_request);
  IF v_old IS NOT NULL THEN RETURN v_old; END IF;
  SELECT * INTO STRICT v_client FROM public.clients WHERE id=(p_request->>'client_id')::uuid FOR UPDATE;
  IF v_client.status <> 'activo' THEN RAISE EXCEPTION 'client_inactive' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT v_settings FROM public.settings WHERE id='00000000-0000-0000-0000-000000000001';
  IF NOT v_settings.tax_policy_approved OR v_settings.tax_rounding_policy IS NULL OR v_settings.tax_prices_include IS NULL THEN
    RAISE EXCEPTION 'financial_tax_policy_pending' USING ERRCODE='55000';
  END IF;
  v_tax_rate := v_settings.tax_rate;
  v_type := p_request->>'payment_type';
  IF v_type NOT IN ('contado','credito') OR jsonb_typeof(p_request->'lines') <> 'array' OR jsonb_array_length(p_request->'lines')=0 THEN
    RAISE EXCEPTION 'invalid_sale_input' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_request->'lines') x
    GROUP BY (x->>'item_id') HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_sale_item_lines' USING ERRCODE='22023';
  END IF;
  -- Lock all stock rows in stable UUID order before checking quantities.
  PERFORM i.id FROM public.inventory i JOIN (
    SELECT (x->>'item_id')::uuid id FROM jsonb_array_elements(p_request->'lines') x GROUP BY 1
  ) requested ON requested.id=i.id ORDER BY i.id FOR UPDATE OF i;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_request->'lines') LOOP
    v_qty := (v_line->>'quantity')::integer;
    IF v_qty <= 0 THEN RAISE EXCEPTION 'invalid_sale_quantity' USING ERRCODE='22023'; END IF;
    IF NOT (v_line ? 'expected_unit_price') THEN RAISE EXCEPTION 'sale_quote_required' USING ERRCODE='22023'; END IF;
    SELECT * INTO STRICT v_item FROM public.inventory WHERE id=(v_line->>'item_id')::uuid;
    IF v_line ? 'expected_unit_price' AND (v_line->>'expected_unit_price')::numeric <> v_item.price THEN
      RAISE EXCEPTION 'catalog_price_conflict' USING ERRCODE='40001';
    END IF;
    IF v_item.quantity < v_qty THEN RAISE EXCEPTION 'insufficient_stock' USING ERRCODE='23514'; END IF;
    v_expected := v_item.price;
    v_subtotal := v_subtotal + v_expected*v_qty;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('item_id',v_item.id,'sku',v_item.sku,'name',v_item.name,'unit_price',v_expected::text,'quantity',v_qty));
    v_stock := v_stock || jsonb_build_object(v_item.id::text,v_item.quantity-v_qty);
  END LOOP;
  -- Until owner-approved tax and rounding settings exist, only a test-configured policy can post.
  IF v_settings.tax_prices_include THEN
    RAISE EXCEPTION 'inclusive_tax_policy_not_implemented' USING ERRCODE='55000';
  END IF;
  IF v_settings.tax_rate <> 0 THEN
    RAISE EXCEPTION 'nonzero_tax_policy_requires_approved_rounding' USING ERRCODE='55000';
  END IF;
  v_subtotal := v_subtotal::numeric(14,2); v_total:=v_subtotal+v_tax;
  v_receipt := 'GS-'||upper(substr(replace(v_sale::text,'-',''),1,12));
  INSERT INTO public.sales(id,receipt_no,client_id,subtotal,tax_rate,tax,total,payment_type,due_date)
  VALUES(v_sale,v_receipt,v_client.id,v_subtotal,v_tax_rate,v_tax,v_total,v_type,nullif(p_request->>'due_date','')::date);
  INSERT INTO public.sale_lines(sale_id,item_id,sku,name,unit_price,quantity)
    SELECT v_sale,(x->>'item_id')::uuid,x->>'sku',x->>'name',(x->>'unit_price')::numeric,(x->>'quantity')::integer
    FROM jsonb_array_elements(v_lines) x;
  PERFORM set_config('grace.business_operation','sale',true);
  UPDATE public.inventory i SET quantity=(x.value)::integer
    FROM jsonb_each_text(v_stock) x WHERE i.id=x.key::uuid;
  IF v_type='credito' THEN
    v_credit:=gen_random_uuid();
    INSERT INTO public.client_credits(id,sale_id,client_id,receipt_no,total,paid,balance,status,due_date)
    VALUES(v_credit,v_sale,v_client.id,v_receipt,v_total,0,v_total,'pendiente',nullif(p_request->>'due_date','')::date);
  END IF;
  v_result:=jsonb_build_object('operation_id',v_op,'sale_id',v_sale,'receipt_no',v_receipt,'client_credit_id',v_credit,
    'client_id',v_client.id,'payment_type',v_type,'due_date',nullif(p_request->>'due_date',''),
    'lines',v_lines,'subtotal',v_subtotal::text,'tax_rate',v_tax_rate::text,'tax',v_tax::text,'total',v_total::text,'stock',v_stock);
  PERFORM private.finish_business_operation(v_op,v_result); RETURN v_result;
END
$function$;


COMMIT;