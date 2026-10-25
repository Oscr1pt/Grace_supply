-- CHG-12: expand inventory into a flexible, configurable product catalog.
-- Legacy columns stay available for historical records and rolling compatibility.
BEGIN;

ALTER TABLE public.inventory
  ADD COLUMN description text NOT NULL DEFAULT '',
  ADD COLUMN brand text,
  ADD COLUMN presentation text,
  ADD COLUMN unit text,
  ADD COLUMN attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.inventory
  ALTER COLUMN kind SET DEFAULT 'product';

ALTER TABLE public.inventory DROP CONSTRAINT inventory_kind_check;
ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_kind_compatibility_check
  CHECK (kind IN ('product', 'joya', 'piedra'));

ALTER TABLE public.inventory DROP CONSTRAINT inventory_category_check;
ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_category_nonempty_check
  CHECK (length(btrim(category)) > 0);

ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_sku_nonempty_check CHECK (length(btrim(sku)) > 0),
  ADD CONSTRAINT inventory_name_nonempty_check CHECK (length(btrim(name)) > 0),
  ADD CONSTRAINT inventory_attributes_object_check CHECK (jsonb_typeof(attributes) = 'object');

-- Preserve familiar display values in neutral columns and retain all other
-- legacy specifications losslessly under attributes.legacy before any later
-- compatibility cleanup is considered.
UPDATE public.inventory
SET brand = coalesce(brand, nullif(btrim(metal), '')),
    presentation = coalesce(presentation, nullif(btrim(karat), '')),
    attributes = attributes || CASE
      WHEN weight_grams IS NOT NULL OR stone IS NOT NULL OR stone_carats IS NOT NULL
        OR stone_cut IS NOT NULL OR stone_clarity IS NOT NULL OR stone_color IS NOT NULL
        OR size_mm IS NOT NULL OR size_label IS NOT NULL
      THEN jsonb_build_object('legacy', jsonb_strip_nulls(jsonb_build_object(
        'weight_grams', weight_grams,
        'stone', stone,
        'stone_carats', stone_carats,
        'stone_cut', stone_cut,
        'stone_clarity', stone_clarity,
        'stone_color', stone_color,
        'size_mm', size_mm,
        'size_label', size_label
      )))
      ELSE '{}'::jsonb
    END;

-- Keep the original direct column grants and RLS policy. These grants add only
-- the new catalog metadata; protected price/cost and stock columns retain the
-- existing column grants and trigger/RPC controls.
GRANT INSERT (description, brand, presentation, unit, attributes, is_active)
  ON public.inventory TO authenticated;
GRANT UPDATE (description, brand, presentation, unit, attributes, is_active)
  ON public.inventory TO authenticated;

CREATE OR REPLACE VIEW public.sales_inventory_lookup WITH (security_barrier = true) AS
  SELECT id, sku, name, price, quantity FROM public.inventory
  WHERE (private.has_permission('sales') OR private.has_permission('purchases'))
    AND is_active;

CREATE OR REPLACE VIEW public.admin_inventory_catalog WITH (security_barrier = true) AS
  SELECT id, sku, kind, name, category, metal, karat, weight_grams, stone,
    stone_carats, stone_cut, stone_clarity, stone_color, size_mm, size_label,
    cost_price, price, quantity, created_at,
    description, brand, presentation, unit, attributes, is_active
  FROM public.inventory
  WHERE private.is_active_admin();

CREATE OR REPLACE FUNCTION public.post_purchase(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE
  v_actor uuid := private.require_business_permission('purchases');
  v_op uuid; v_old jsonb; v_key uuid; v_purchase uuid := gen_random_uuid();
  v_credit uuid; v_supplier public.suppliers%ROWTYPE; v_item public.inventory%ROWTYPE;
  v_quantity integer; v_cost numeric(14,2); v_total numeric(14,2); v_restock boolean;
  v_type text; v_supplier_name text; v_result jsonb;
BEGIN
  SELECT operation_id, prior_result INTO v_op,v_old FROM private.reserve_business_operation(v_actor,'purchase',p_request);
  IF v_old IS NOT NULL THEN RETURN v_old; END IF;
  v_key := (p_request->>'idempotency_key')::uuid;
  v_quantity := (p_request->>'quantity')::integer;
  v_cost := (p_request->>'unit_cost')::numeric;
  v_restock := coalesce((p_request->>'restock')::boolean,false);
  v_type := p_request->>'payment_type';
  IF v_quantity IS NULL OR v_quantity <= 0 OR v_cost IS NULL OR v_cost < 0 OR v_type NOT IN ('contado','credito') THEN
    RAISE EXCEPTION 'invalid_purchase_input' USING ERRCODE='22023';
  END IF;
  v_total := (v_quantity::numeric * v_cost)::numeric(14,2);
  IF p_request ? 'supplier_id' AND p_request->>'supplier_id' IS NOT NULL THEN
    SELECT * INTO STRICT v_supplier FROM public.suppliers WHERE id=(p_request->>'supplier_id')::uuid FOR UPDATE;
    IF v_supplier.status <> 'activo' THEN RAISE EXCEPTION 'supplier_inactive' USING ERRCODE='23514'; END IF;
    v_supplier_name := v_supplier.name;
  ELSE
    v_supplier_name := nullif(btrim(p_request->>'supplier_name'),'');
  END IF;
  IF v_type='credito' AND (v_supplier.id IS NULL OR nullif(btrim(p_request->>'invoice_no'),'') IS NULL) THEN
    RAISE EXCEPTION 'supplier_credit_requires_supplier_and_invoice' USING ERRCODE='22023';
  END IF;
  IF nullif(p_request->>'item_id','') IS NOT NULL THEN
    SELECT * INTO STRICT v_item FROM public.inventory WHERE id=(p_request->>'item_id')::uuid FOR UPDATE;
    IF NOT v_item.is_active THEN RAISE EXCEPTION 'inventory_item_inactive' USING ERRCODE='23514'; END IF;
  END IF;
  v_purchase := gen_random_uuid();
  INSERT INTO public.purchases(id,supplier,supplier_id,item_id,description,quantity,unit_cost,total,payment_type,invoice_no,due_date)
  VALUES(v_purchase,coalesce(v_supplier_name,'Proveedor no identificado'),v_supplier.id,
    CASE WHEN nullif(p_request->>'item_id','') IS NOT NULL THEN v_item.id ELSE null END,coalesce(p_request->>'description',''),v_quantity,v_cost,v_total,v_type,
    nullif(p_request->>'invoice_no',''),nullif(p_request->>'due_date','')::date);
  IF v_restock THEN
    IF v_item.id IS NULL THEN RAISE EXCEPTION 'restock_requires_inventory_item' USING ERRCODE='22023'; END IF;
    PERFORM set_config('grace.business_operation','purchase',true);
    UPDATE public.inventory SET quantity=quantity+v_quantity WHERE id=v_item.id;
  END IF;
  IF v_type='credito' THEN
    v_credit := gen_random_uuid();
    INSERT INTO public.supplier_credits(id,purchase_id,supplier_id,supplier_name,invoice_no,total,paid,balance,status,due_date)
    VALUES(v_credit,v_purchase,v_supplier.id,v_supplier.name,p_request->>'invoice_no',v_total,0,v_total,'pendiente',nullif(p_request->>'due_date','')::date);
  END IF;
  v_result := jsonb_build_object('operation_id',v_op,'purchase_id',v_purchase,'supplier_credit_id',v_credit,'total',v_total::text,
    'stock_quantity',CASE WHEN v_restock THEN v_item.quantity+v_quantity ELSE null END);
  PERFORM private.finish_business_operation(v_op,v_result);
  RETURN v_result;
END
$function$;

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
    IF (v_line->>'expected_unit_price')::numeric <> v_item.price THEN
      RAISE EXCEPTION 'catalog_price_conflict' USING ERRCODE='40001';
    END IF;
    IF v_item.quantity < v_qty THEN RAISE EXCEPTION 'insufficient_stock' USING ERRCODE='23514'; END IF;
    v_expected := v_item.price;
    v_subtotal := v_subtotal + v_expected*v_qty;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('item_id',v_item.id,'sku',v_item.sku,'name',v_item.name,'unit_price',v_expected::text,'quantity',v_qty));
    v_stock := v_stock || jsonb_build_object(v_item.id::text,v_item.quantity-v_qty);
  END LOOP;
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

REVOKE ALL ON FUNCTION public.post_sale(jsonb), public.post_purchase(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_sale(jsonb), public.post_purchase(jsonb) TO authenticated;

COMMIT;
