-- CHG-07: transactional financial posting. Apply only to the local schema in this change.
BEGIN;

ALTER TABLE public.settings
  ADD COLUMN tax_policy_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN tax_prices_include boolean,
  ADD COLUMN tax_rounding_policy text;
ALTER TABLE public.settings
  ADD CONSTRAINT settings_tax_policy_complete CHECK (
    NOT tax_policy_approved OR
    (tax_prices_include IS NOT NULL AND tax_rounding_policy IS NOT NULL)
  );
REVOKE UPDATE (tax_policy_approved, tax_prices_include, tax_rounding_policy) ON public.settings FROM authenticated;

CREATE TABLE public.business_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation_type text NOT NULL CHECK (operation_type IN ('sale','purchase','client_payment','supplier_payment','inventory_adjustment')),
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  request jsonb NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_id, operation_type, idempotency_key)
);
ALTER TABLE public.business_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_operations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.business_operations TO service_role;

CREATE OR REPLACE FUNCTION private.require_business_permission(p_permission text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT private.has_permission(p_permission) THEN
    RAISE EXCEPTION 'business_operation_not_authorized' USING ERRCODE='42501';
  END IF;
  RETURN v_actor;
END
$function$;

CREATE OR REPLACE FUNCTION private.reserve_business_operation(
  p_actor uuid, p_type text, p_request jsonb
) RETURNS TABLE(operation_id uuid, prior_result jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE v_key uuid; v_hash text; v_saved public.business_operations%ROWTYPE;
BEGIN
  BEGIN v_key := (p_request->>'idempotency_key')::uuid;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE='22023'; END;
  v_hash := encode(sha256(convert_to((p_request - 'idempotency_key')::text, 'UTF8')), 'hex');
  INSERT INTO public.business_operations(actor_id, operation_type, idempotency_key, request_hash, request)
  VALUES (p_actor, p_type, v_key, v_hash, p_request - 'idempotency_key')
  ON CONFLICT (actor_id, operation_type, idempotency_key) DO NOTHING;
  SELECT * INTO STRICT v_saved FROM public.business_operations
   WHERE actor_id=p_actor AND operation_type=p_type AND idempotency_key=v_key FOR UPDATE;
  IF v_saved.request_hash <> v_hash THEN
    RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='23505';
  END IF;
  RETURN QUERY SELECT v_saved.id, v_saved.result;
END
$function$;

CREATE OR REPLACE FUNCTION private.finish_business_operation(p_id uuid, p_result jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  UPDATE public.business_operations SET result=p_result WHERE id=p_id AND result IS NULL
$function$;

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
  END IF;
  v_purchase := gen_random_uuid();
  INSERT INTO public.purchases(id,supplier,supplier_id,item_id,description,quantity,unit_cost,total,payment_type,invoice_no,due_date)
  VALUES(v_purchase,coalesce(v_supplier_name,'Proveedor no identificado'),v_supplier.id,
    CASE WHEN nullif(p_request->>'item_id','') IS NOT NULL THEN v_item.id ELSE null END,coalesce(p_request->>'description',''),v_quantity,v_cost,v_total,v_type,
    nullif(p_request->>'invoice_no',''),nullif(p_request->>'due_date','')::date);
  IF v_restock THEN
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

CREATE OR REPLACE FUNCTION public.post_credit_payment(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE
  v_kind text:=p_request->>'credit_type'; v_permission text; v_actor uuid; v_op uuid; v_old jsonb;
  v_credit_id uuid:=(p_request->>'credit_id')::uuid; v_amount numeric(14,2):=(p_request->>'amount')::numeric;
  v_paid numeric(14,2); v_balance numeric(14,2); v_total numeric(14,2); v_status text; v_payment uuid:=gen_random_uuid(); v_result jsonb;
BEGIN
  v_permission:=CASE v_kind WHEN 'client' THEN 'clients' WHEN 'supplier' THEN 'suppliers' ELSE null END;
  IF v_permission IS NULL THEN RAISE EXCEPTION 'invalid_credit_type' USING ERRCODE='22023'; END IF;
  v_actor:=private.require_business_permission(v_permission);
  SELECT operation_id,prior_result INTO v_op,v_old FROM private.reserve_business_operation(v_actor,v_kind||'_payment',p_request);
  IF v_old IS NOT NULL THEN RETURN v_old; END IF;
  IF v_amount IS NULL OR v_amount<=0 THEN RAISE EXCEPTION 'invalid_payment_amount' USING ERRCODE='22023'; END IF;
  IF v_kind='client' THEN
    SELECT paid,balance,total INTO STRICT v_paid,v_balance,v_total FROM public.client_credits WHERE id=v_credit_id FOR UPDATE;
  ELSE
    SELECT paid,balance,total INTO STRICT v_paid,v_balance,v_total FROM public.supplier_credits WHERE id=v_credit_id FOR UPDATE;
  END IF;
  IF v_amount>v_balance THEN RAISE EXCEPTION 'payment_exceeds_balance' USING ERRCODE='23514'; END IF;
  INSERT INTO public.credit_payments(id,client_credit_id,supplier_credit_id,amount,date,method,reference,note)
  VALUES(v_payment,CASE WHEN v_kind='client' THEN v_credit_id END,CASE WHEN v_kind='supplier' THEN v_credit_id END,
    v_amount,coalesce(nullif(p_request->>'date','')::date,current_date),coalesce(nullif(p_request->>'method',''),'efectivo'),nullif(p_request->>'reference',''),nullif(p_request->>'note',''));
  v_paid:=v_paid+v_amount; v_balance:=v_total-v_paid;
  v_status:=CASE WHEN v_balance=0 THEN 'pagada' WHEN v_paid>0 THEN 'parcial' ELSE 'pendiente' END;
  IF v_kind='client' THEN UPDATE public.client_credits SET paid=v_paid,balance=v_balance,status=v_status WHERE id=v_credit_id;
  ELSE UPDATE public.supplier_credits SET paid=v_paid,balance=v_balance,status=v_status WHERE id=v_credit_id; END IF;
  v_result:=jsonb_build_object('operation_id',v_op,'payment_id',v_payment,'credit_id',v_credit_id,'paid',v_paid::text,'balance',v_balance::text,'status',v_status);
  PERFORM private.finish_business_operation(v_op,v_result); RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.adjust_inventory(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE v_actor uuid:=private.require_business_permission('inventory'); v_op uuid; v_old jsonb; v_item public.inventory%ROWTYPE; v_delta integer; v_result jsonb;
BEGIN
  SELECT operation_id,prior_result INTO v_op,v_old FROM private.reserve_business_operation(v_actor,'inventory_adjustment',p_request);
  IF v_old IS NOT NULL THEN RETURN v_old; END IF;
  v_delta:=(p_request->>'delta')::integer;
  IF v_delta=0 OR nullif(btrim(p_request->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'invalid_inventory_adjustment' USING ERRCODE='22023'; END IF;
  SELECT * INTO STRICT v_item FROM public.inventory WHERE id=(p_request->>'item_id')::uuid FOR UPDATE;
  IF p_request ? 'expected_quantity' AND v_item.quantity<>(p_request->>'expected_quantity')::integer THEN RAISE EXCEPTION 'inventory_version_conflict' USING ERRCODE='40001'; END IF;
  IF v_item.quantity+v_delta<0 THEN RAISE EXCEPTION 'insufficient_stock' USING ERRCODE='23514'; END IF;
  PERFORM set_config('grace.business_operation','adjust_inventory',true);
  UPDATE public.inventory SET quantity=quantity+v_delta WHERE id=v_item.id;
  v_result:=jsonb_build_object('operation_id',v_op,'item_id',v_item.id,'previous_quantity',v_item.quantity,'quantity',v_item.quantity+v_delta,'delta',v_delta);
  PERFORM private.finish_business_operation(v_op,v_result); RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.get_business_operation(p_operation_type text,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE v_permission text; v_actor uuid; v_result jsonb;
BEGIN
  v_permission:=CASE p_operation_type WHEN 'sale' THEN 'sales' WHEN 'purchase' THEN 'purchases'
    WHEN 'client_payment' THEN 'clients' WHEN 'supplier_payment' THEN 'suppliers' WHEN 'inventory_adjustment' THEN 'inventory' ELSE null END;
  IF v_permission IS NULL THEN RAISE EXCEPTION 'invalid_operation_type' USING ERRCODE='22023'; END IF;
  v_actor:=private.require_business_permission(v_permission);
  SELECT result INTO v_result FROM public.business_operations WHERE actor_id=v_actor AND operation_type=p_operation_type AND idempotency_key=p_idempotency_key;
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION private.guard_inventory_protected_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE v_operation text:=current_setting('grace.business_operation',true);
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.quantity<>0 THEN RAISE EXCEPTION 'Stock must be changed through an authorized purchase operation' USING ERRCODE='42501'; END IF;
    IF auth.role()<>'service_role' AND NOT private.is_active_admin() AND (NEW.price<>0 OR NEW.cost_price<>0) THEN
      RAISE EXCEPTION 'Only an active administrator may set inventory prices' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    IF v_operation='sale' AND NOT private.has_permission('sales') THEN RAISE EXCEPTION 'business_operation_not_authorized' USING ERRCODE='42501'; END IF;
    IF v_operation='purchase' AND NOT private.has_permission('purchases') THEN RAISE EXCEPTION 'business_operation_not_authorized' USING ERRCODE='42501'; END IF;
    IF v_operation='adjust_inventory' AND NOT private.has_permission('inventory') THEN RAISE EXCEPTION 'business_operation_not_authorized' USING ERRCODE='42501'; END IF;
    IF auth.role()<>'service_role' AND v_operation NOT IN ('sale','purchase','adjust_inventory') THEN
      RAISE EXCEPTION 'Stock must be changed through an authorized business operation' USING ERRCODE='42501'; END IF;
  END IF;
  IF auth.role()<>'service_role' AND NOT private.is_active_admin() AND (NEW.price IS DISTINCT FROM OLD.price OR NEW.cost_price IS DISTINCT FROM OLD.cost_price) THEN
    RAISE EXCEPTION 'Only an active administrator may change inventory prices' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION private.require_business_permission(text), private.reserve_business_operation(uuid,text,jsonb), private.finish_business_operation(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.post_sale(jsonb),public.post_purchase(jsonb),public.post_credit_payment(jsonb),public.adjust_inventory(jsonb),public.get_business_operation(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_sale(jsonb),public.post_purchase(jsonb),public.post_credit_payment(jsonb),public.adjust_inventory(jsonb),public.get_business_operation(text,uuid) TO authenticated;

COMMIT;
