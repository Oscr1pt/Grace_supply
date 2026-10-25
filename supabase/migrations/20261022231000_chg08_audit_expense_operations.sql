BEGIN;

ALTER TABLE public.business_operations DROP CONSTRAINT business_operations_operation_type_check;
ALTER TABLE public.business_operations ADD CONSTRAINT business_operations_operation_type_check
  CHECK (operation_type IN ('sale','purchase','client_payment','supplier_payment','inventory_adjustment','expense','financial_annulment','payment_reversal'));
REVOKE INSERT, UPDATE ON public.expenses FROM authenticated;

CREATE OR REPLACE FUNCTION private.audit_business_operation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $$
DECLARE v_type text; v_entity text; v_id uuid; v_details jsonb := '{}'::jsonb;
BEGIN
  IF OLD.result IS NULL AND NEW.result IS NOT NULL THEN
    v_type:=NEW.operation_type;
    v_entity:=CASE v_type WHEN 'sale' THEN 'sale' WHEN 'purchase' THEN 'purchase' WHEN 'expense' THEN 'expense'
      WHEN 'client_payment' THEN 'client_credit' WHEN 'supplier_payment' THEN 'supplier_credit'
      WHEN 'inventory_adjustment' THEN 'inventory' ELSE 'financial_document' END;
    v_id:=CASE v_type WHEN 'sale' THEN nullif(NEW.result->>'sale_id','')::uuid
      WHEN 'purchase' THEN nullif(NEW.result->>'purchase_id','')::uuid WHEN 'expense' THEN nullif(NEW.result->>'expense_id','')::uuid
      WHEN 'client_payment' THEN nullif(NEW.result->>'credit_id','')::uuid WHEN 'supplier_payment' THEN nullif(NEW.result->>'credit_id','')::uuid
      WHEN 'inventory_adjustment' THEN nullif(NEW.result->>'item_id','')::uuid ELSE nullif(NEW.result->>'document_id','')::uuid END;
    IF v_id IS NULL THEN RAISE EXCEPTION 'financial_audit_entity_required' USING ERRCODE='23514'; END IF;
    v_details:=jsonb_strip_nulls(jsonb_build_object('amount',coalesce(NEW.result->>'total',NEW.result->>'amount'),
      'payment_id',NEW.result->>'payment_id','delta',NEW.result->>'delta','reason',NEW.result->>'reason','compensation_id',NEW.result->>'compensation_id'));
    IF v_details::text ~* '(password|token|secret|email|username)' THEN RAISE EXCEPTION 'sensitive_audit_data_rejected' USING ERRCODE='23514'; END IF;
    INSERT INTO public.financial_audit_events(operation_id,actor_id,event_type,entity_type,entity_id,details)
      VALUES(NEW.id,NEW.actor_id,v_type,v_entity,v_id,v_details);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.post_expense(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,auth AS $$
DECLARE v_actor uuid:=private.require_business_permission('expenses'); v_op uuid; v_old jsonb; v_id uuid:=gen_random_uuid();
  v_amount numeric(14,2); v_result jsonb;
BEGIN
  SELECT operation_id,prior_result INTO v_op,v_old FROM private.reserve_business_operation(v_actor,'expense',p_request);
  IF v_old IS NOT NULL THEN RETURN v_old; END IF;
  v_amount:=(p_request->>'amount')::numeric;
  IF v_amount IS NULL OR v_amount<=0 OR nullif(btrim(coalesce(p_request->>'concept','')),'') IS NULL
    OR nullif(btrim(coalesce(p_request->>'beneficiary','')),'') IS NULL THEN RAISE EXCEPTION 'invalid_expense_input' USING ERRCODE='22023'; END IF;
  INSERT INTO public.expenses(id,concept,category,description,amount,date,payment_method,beneficiary,reference,note)
    VALUES(v_id,btrim(p_request->>'concept'),p_request->>'category',coalesce(p_request->>'description',''),v_amount,
      coalesce(nullif(p_request->>'date','')::date,current_date),p_request->>'payment_method',btrim(p_request->>'beneficiary'),
      nullif(p_request->>'reference',''),nullif(p_request->>'note',''));
  v_result:=jsonb_build_object('operation_id',v_op,'expense_id',v_id,'amount',v_amount::text);
  PERFORM private.finish_business_operation(v_op,v_result); RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.get_business_operation(p_operation_type text,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,auth AS $$
DECLARE v_permission text; v_actor uuid; v_result jsonb;
BEGIN
  IF p_operation_type IN ('financial_annulment','payment_reversal') THEN
    IF NOT private.is_active_admin() THEN RAISE EXCEPTION 'business_operation_not_authorized' USING ERRCODE='42501'; END IF;
    v_actor:=auth.uid();
  ELSE
    v_permission:=CASE p_operation_type WHEN 'sale' THEN 'sales' WHEN 'purchase' THEN 'purchases' WHEN 'expense' THEN 'expenses'
      WHEN 'client_payment' THEN 'clients' WHEN 'supplier_payment' THEN 'suppliers' WHEN 'inventory_adjustment' THEN 'inventory' ELSE null END;
    IF v_permission IS NULL THEN RAISE EXCEPTION 'invalid_operation_type' USING ERRCODE='22023'; END IF;
    v_actor:=private.require_business_permission(v_permission);
  END IF;
  SELECT result INTO v_result FROM public.business_operations WHERE actor_id=v_actor AND operation_type=p_operation_type AND idempotency_key=p_idempotency_key;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.post_expense(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_expense(jsonb) TO authenticated;
COMMIT;
