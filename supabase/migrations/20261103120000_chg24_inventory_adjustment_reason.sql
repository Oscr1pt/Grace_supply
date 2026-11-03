-- CHG-24: persist a validated reason in inventory adjustment results and audit events.
CREATE OR REPLACE FUNCTION public.adjust_inventory(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE
  v_actor uuid := private.require_business_permission('inventory');
  v_op uuid;
  v_old jsonb;
  v_item public.inventory%ROWTYPE;
  v_delta integer;
  v_reason text := btrim(coalesce(p_request->>'reason', ''));
  v_result jsonb;
BEGIN
  v_delta := (p_request->>'delta')::integer;
  IF v_delta = 0 OR length(v_reason) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid_inventory_adjustment' USING ERRCODE = '22023';
  END IF;

  SELECT operation_id, prior_result
    INTO v_op, v_old
    FROM private.reserve_business_operation(v_actor, 'inventory_adjustment', p_request);
  IF v_old IS NOT NULL THEN
    RETURN v_old;
  END IF;

  SELECT * INTO STRICT v_item
    FROM public.inventory
   WHERE id = (p_request->>'item_id')::uuid
   FOR UPDATE;

  IF p_request ? 'expected_quantity'
     AND v_item.quantity <> (p_request->>'expected_quantity')::integer THEN
    RAISE EXCEPTION 'inventory_version_conflict' USING ERRCODE = '40001';
  END IF;
  IF v_item.quantity + v_delta < 0 THEN
    RAISE EXCEPTION 'insufficient_stock' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('grace.business_operation', 'adjust_inventory', true);
  UPDATE public.inventory
     SET quantity = quantity + v_delta
   WHERE id = v_item.id;

  v_result := jsonb_build_object(
    'operation_id', v_op,
    'item_id', v_item.id,
    'previous_quantity', v_item.quantity,
    'quantity', v_item.quantity + v_delta,
    'delta', v_delta,
    'reason', v_reason
  );
  PERFORM private.finish_business_operation(v_op, v_result);
  RETURN v_result;
END
$function$;

COMMENT ON FUNCTION public.adjust_inventory(jsonb) IS
  'Atomically adjusts inventory with authorization, optimistic concurrency, idempotency, and an auditable reason.';

CREATE OR REPLACE FUNCTION private.audit_business_operation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_type text;
  v_entity text;
  v_id uuid;
  v_details jsonb := '{}'::jsonb;
BEGIN
  IF OLD.result IS NULL AND NEW.result IS NOT NULL THEN
    v_type := NEW.operation_type;
    v_entity := CASE v_type
      WHEN 'sale' THEN 'sale'
      WHEN 'purchase' THEN 'purchase'
      WHEN 'expense' THEN 'expense'
      WHEN 'client_payment' THEN 'client_credit'
      WHEN 'supplier_payment' THEN 'supplier_credit'
      WHEN 'inventory_adjustment' THEN 'inventory'
      ELSE 'financial_document'
    END;
    v_id := CASE v_type
      WHEN 'sale' THEN nullif(NEW.result->>'sale_id', '')::uuid
      WHEN 'purchase' THEN nullif(NEW.result->>'purchase_id', '')::uuid
      WHEN 'expense' THEN nullif(NEW.result->>'expense_id', '')::uuid
      WHEN 'client_payment' THEN nullif(NEW.result->>'credit_id', '')::uuid
      WHEN 'supplier_payment' THEN nullif(NEW.result->>'credit_id', '')::uuid
      WHEN 'inventory_adjustment' THEN nullif(NEW.result->>'item_id', '')::uuid
      ELSE nullif(NEW.result->>'document_id', '')::uuid
    END;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'financial_audit_entity_required' USING ERRCODE = '23514';
    END IF;
    v_details := jsonb_strip_nulls(jsonb_build_object(
      'amount', coalesce(NEW.result->>'total', NEW.result->>'amount'),
      'payment_id', NEW.result->>'payment_id',
      'delta', NEW.result->>'delta',
      'previous_quantity', NEW.result->>'previous_quantity',
      'quantity', NEW.result->>'quantity',
      'reason', NEW.result->>'reason',
      'compensation_id', NEW.result->>'compensation_id'
    ));
    IF v_details::text ~* '(password|token|secret|email|username)' THEN
      RAISE EXCEPTION 'sensitive_audit_data_rejected' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.financial_audit_events(operation_id, actor_id, event_type, entity_type, entity_id, details)
    VALUES (NEW.id, NEW.actor_id, v_type, v_entity, v_id, v_details);
  END IF;
  RETURN NEW;
END
$function$;
