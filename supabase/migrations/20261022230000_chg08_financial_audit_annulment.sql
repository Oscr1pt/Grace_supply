BEGIN;

-- Additive CHG-08 evidence and compensation ledger. Existing test rows are not backfilled.
ALTER TABLE public.business_operations DROP CONSTRAINT business_operations_operation_type_check;
ALTER TABLE public.business_operations ADD CONSTRAINT business_operations_operation_type_check
  CHECK (operation_type IN ('sale','purchase','client_payment','supplier_payment','inventory_adjustment','financial_annulment','payment_reversal'));

CREATE TABLE public.financial_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL UNIQUE REFERENCES public.business_operations(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (jsonb_typeof(details) = 'object')
);
ALTER TABLE public.financial_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_audit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.financial_audit_events TO authenticated;
CREATE POLICY financial_audit_admin_read ON public.financial_audit_events FOR SELECT TO authenticated USING (private.is_active_admin());

CREATE TABLE public.financial_compensations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL UNIQUE REFERENCES public.business_operations(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  original_type text NOT NULL CHECK (original_type IN ('sale','purchase','expense','payment')),
  original_id uuid NOT NULL,
  compensation_type text NOT NULL CHECK (compensation_type IN ('annulment','payment_reversal')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.financial_compensations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_compensations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.financial_compensations TO authenticated;
CREATE POLICY financial_compensations_admin_read ON public.financial_compensations FOR SELECT TO authenticated USING (private.is_active_admin());

ALTER TABLE public.sales ADD COLUMN voided_at timestamptz, ADD COLUMN voided_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN void_reason text;
ALTER TABLE public.purchases ADD COLUMN voided_at timestamptz, ADD COLUMN voided_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN void_reason text;
ALTER TABLE public.expenses ADD COLUMN voided_at timestamptz, ADD COLUMN voided_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN void_reason text;
ALTER TABLE public.client_credits ADD COLUMN voided_principal numeric(14,2) NOT NULL DEFAULT 0 CHECK (voided_principal >= 0);
ALTER TABLE public.supplier_credits ADD COLUMN voided_principal numeric(14,2) NOT NULL DEFAULT 0 CHECK (voided_principal >= 0);
ALTER TABLE public.client_credits DROP CONSTRAINT client_credits_check;
ALTER TABLE public.client_credits ADD CONSTRAINT client_credits_principal_consistent CHECK (paid + balance + voided_principal = total);
ALTER TABLE public.supplier_credits DROP CONSTRAINT supplier_credits_check;
ALTER TABLE public.supplier_credits ADD CONSTRAINT supplier_credits_principal_consistent CHECK (paid + balance + voided_principal = total);
ALTER TABLE public.client_credits DROP CONSTRAINT client_credits_status_check;
ALTER TABLE public.client_credits ADD CONSTRAINT client_credits_status_check CHECK (status IN ('pendiente','parcial','pagada','vencida','anulada'));
ALTER TABLE public.supplier_credits DROP CONSTRAINT supplier_credits_status_check;
ALTER TABLE public.supplier_credits ADD CONSTRAINT supplier_credits_status_check CHECK (status IN ('pendiente','parcial','pagada','vencida','anulada'));

CREATE TABLE public.payment_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL UNIQUE REFERENCES public.credit_payments(id) ON DELETE RESTRICT,
  operation_id uuid NOT NULL UNIQUE REFERENCES public.business_operations(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.payment_reversals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_reversals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_reversals TO authenticated;
CREATE POLICY payment_reversals_admin_read ON public.payment_reversals FOR SELECT TO authenticated USING (private.is_active_admin());

CREATE OR REPLACE FUNCTION private.guard_chg08_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.role()='service_role' THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  RAISE EXCEPTION 'financial_history_is_append_only' USING ERRCODE='42501';
END $$;
CREATE TRIGGER financial_audit_immutable BEFORE UPDATE OR DELETE ON public.financial_audit_events
  FOR EACH ROW EXECUTE FUNCTION private.guard_chg08_append_only();
CREATE TRIGGER financial_compensations_immutable BEFORE UPDATE OR DELETE ON public.financial_compensations
  FOR EACH ROW EXECUTE FUNCTION private.guard_chg08_append_only();
CREATE TRIGGER payment_reversals_immutable BEFORE UPDATE OR DELETE ON public.payment_reversals
  FOR EACH ROW EXECUTE FUNCTION private.guard_chg08_append_only();

CREATE OR REPLACE FUNCTION private.audit_business_operation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $$
DECLARE v_type text; v_entity text; v_id uuid; v_details jsonb := '{}'::jsonb;
BEGIN
  IF OLD.result IS NULL AND NEW.result IS NOT NULL THEN
    v_type := NEW.operation_type;
    v_entity := CASE v_type WHEN 'sale' THEN 'sale' WHEN 'purchase' THEN 'purchase'
      WHEN 'client_payment' THEN 'client_credit' WHEN 'supplier_payment' THEN 'supplier_credit'
      WHEN 'inventory_adjustment' THEN 'inventory' ELSE 'financial_document' END;
    v_id := CASE v_type WHEN 'sale' THEN nullif(NEW.result->>'sale_id','')::uuid
      WHEN 'purchase' THEN nullif(NEW.result->>'purchase_id','')::uuid
      WHEN 'client_payment' THEN nullif(NEW.result->>'credit_id','')::uuid
      WHEN 'supplier_payment' THEN nullif(NEW.result->>'credit_id','')::uuid
      WHEN 'inventory_adjustment' THEN nullif(NEW.result->>'item_id','')::uuid
      ELSE nullif(NEW.result->>'document_id','')::uuid END;
    IF v_id IS NULL THEN RAISE EXCEPTION 'financial_audit_entity_required' USING ERRCODE='23514'; END IF;
    v_details := jsonb_strip_nulls(jsonb_build_object('amount',NEW.result->>'total','payment_id',NEW.result->>'payment_id',
      'delta',NEW.result->>'delta','reason',NEW.result->>'reason','compensation_id',NEW.result->>'compensation_id'));
    IF v_details::text ~* '(password|token|secret|email|username)' THEN RAISE EXCEPTION 'sensitive_audit_data_rejected' USING ERRCODE='23514'; END IF;
    INSERT INTO public.financial_audit_events(operation_id,actor_id,event_type,entity_type,entity_id,details)
      VALUES(NEW.id,NEW.actor_id,v_type,v_entity,v_id,v_details);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER business_operation_audit AFTER UPDATE OF result ON public.business_operations
  FOR EACH ROW EXECUTE FUNCTION private.audit_business_operation();

CREATE OR REPLACE FUNCTION private.guard_financial_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.role()='service_role' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'financial_documents_cannot_be_deleted' USING ERRCODE='42501';
END $$;
CREATE TRIGGER sales_no_delete BEFORE DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION private.guard_financial_delete();
CREATE TRIGGER sale_lines_no_delete BEFORE DELETE ON public.sale_lines FOR EACH ROW EXECUTE FUNCTION private.guard_financial_delete();
CREATE TRIGGER purchases_no_delete BEFORE DELETE ON public.purchases FOR EACH ROW EXECUTE FUNCTION private.guard_financial_delete();
CREATE TRIGGER client_credits_no_delete BEFORE DELETE ON public.client_credits FOR EACH ROW EXECUTE FUNCTION private.guard_financial_delete();
CREATE TRIGGER supplier_credits_no_delete BEFORE DELETE ON public.supplier_credits FOR EACH ROW EXECUTE FUNCTION private.guard_financial_delete();
CREATE TRIGGER credit_payments_no_delete BEFORE DELETE ON public.credit_payments FOR EACH ROW EXECUTE FUNCTION private.guard_financial_delete();
CREATE TRIGGER expenses_no_delete BEFORE DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION private.guard_financial_delete();

CREATE OR REPLACE FUNCTION private.guard_inventory_protected_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,auth AS $$
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
    IF v_operation='financial_annulment' AND NOT private.is_active_admin() THEN RAISE EXCEPTION 'business_operation_not_authorized' USING ERRCODE='42501'; END IF;
    IF auth.role()<>'service_role' AND v_operation NOT IN ('sale','purchase','adjust_inventory','financial_annulment') THEN
      RAISE EXCEPTION 'Stock must be changed through an authorized business operation' USING ERRCODE='42501'; END IF;
  END IF;
  IF auth.role()<>'service_role' AND NOT private.is_active_admin() AND (NEW.price IS DISTINCT FROM OLD.price OR NEW.cost_price IS DISTINCT FROM OLD.cost_price) THEN
    RAISE EXCEPTION 'Only an active administrator may change inventory prices' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.annul_financial_document(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,auth AS $$
DECLARE v_actor uuid:=auth.uid(); v_op uuid; v_old jsonb; v_key uuid; v_kind text:=p_request->>'document_type';
  v_id uuid:=(p_request->>'document_id')::uuid; v_reason text:=btrim(coalesce(p_request->>'reason',''));
  v_amount numeric(14,2); v_result jsonb; v_credit record; v_line record; v_purchase public.purchases%ROWTYPE;
  v_restock boolean; v_item public.inventory%ROWTYPE;
BEGIN
  IF NOT private.is_active_admin() THEN RAISE EXCEPTION 'business_operation_not_authorized' USING ERRCODE='42501'; END IF;
  IF length(v_reason) NOT BETWEEN 1 AND 500 OR v_kind NOT IN ('sale','purchase','expense') THEN RAISE EXCEPTION 'invalid_annulment_request' USING ERRCODE='22023'; END IF;
  SELECT operation_id,prior_result INTO v_op,v_old FROM private.reserve_business_operation(v_actor,'financial_annulment',p_request);
  IF v_old IS NOT NULL THEN RETURN v_old; END IF;
  v_key:=(p_request->>'idempotency_key')::uuid;
  IF v_kind='sale' THEN
    SELECT total INTO STRICT v_amount FROM public.sales WHERE id=v_id AND voided_at IS NULL FOR UPDATE;
    SELECT * INTO v_credit FROM public.client_credits WHERE sale_id=v_id FOR UPDATE;
    IF FOUND AND v_credit.paid>0 THEN RAISE EXCEPTION 'active_payments_require_reversal' USING ERRCODE='23514'; END IF;
    FOR v_line IN SELECT item_id,sum(quantity)::integer qty FROM public.sale_lines WHERE sale_id=v_id GROUP BY item_id ORDER BY item_id LOOP
      SELECT * INTO STRICT v_item FROM public.inventory WHERE id=v_line.item_id FOR UPDATE;
      PERFORM set_config('grace.business_operation','financial_annulment',true);
      UPDATE public.inventory SET quantity=quantity+v_line.qty WHERE id=v_item.id;
    END LOOP;
    IF v_credit.id IS NOT NULL THEN
      UPDATE public.client_credits SET voided_principal=total,balance=0,status='anulada' WHERE id=v_credit.id;
    END IF;
    UPDATE public.sales SET voided_at=clock_timestamp(),voided_by=v_actor,void_reason=v_reason WHERE id=v_id;
  ELSIF v_kind='purchase' THEN
    SELECT * INTO STRICT v_purchase FROM public.purchases WHERE id=v_id AND voided_at IS NULL FOR UPDATE;
    v_amount:=v_purchase.total;
    SELECT * INTO v_credit FROM public.supplier_credits WHERE purchase_id=v_id FOR UPDATE;
    IF FOUND AND v_credit.paid>0 THEN RAISE EXCEPTION 'active_payments_require_reversal' USING ERRCODE='23514'; END IF;
    SELECT (request->>'restock')::boolean INTO v_restock FROM public.business_operations WHERE result->>'purchase_id'=v_id::text AND operation_type='purchase';
    IF coalesce(v_restock,false) AND v_purchase.item_id IS NOT NULL THEN
      SELECT * INTO STRICT v_item FROM public.inventory WHERE id=v_purchase.item_id FOR UPDATE;
      IF v_item.quantity<v_purchase.quantity THEN RAISE EXCEPTION 'insufficient_stock_for_annulment' USING ERRCODE='23514'; END IF;
      PERFORM set_config('grace.business_operation','financial_annulment',true);
      UPDATE public.inventory SET quantity=quantity-v_purchase.quantity WHERE id=v_item.id;
    END IF;
    IF v_credit.id IS NOT NULL THEN UPDATE public.supplier_credits SET voided_principal=total,balance=0,status='anulada' WHERE id=v_credit.id; END IF;
    UPDATE public.purchases SET voided_at=clock_timestamp(),voided_by=v_actor,void_reason=v_reason WHERE id=v_id;
  ELSE
    SELECT amount INTO STRICT v_amount FROM public.expenses WHERE id=v_id AND status='registrado' FOR UPDATE;
    UPDATE public.expenses SET status='anulado',updated_at=clock_timestamp(),voided_at=clock_timestamp(),voided_by=v_actor,void_reason=v_reason WHERE id=v_id;
  END IF;
  INSERT INTO public.financial_compensations(operation_id,actor_id,original_type,original_id,compensation_type,amount,reason)
    VALUES(v_op,v_actor,v_kind,v_id,'annulment',v_amount,v_reason);
  v_result:=jsonb_build_object('operation_id',v_op,'document_type',v_kind,'document_id',v_id,'amount',v_amount::text,'reason',v_reason,'compensation_id',v_op);
  PERFORM private.finish_business_operation(v_op,v_result); RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.reverse_credit_payment(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,auth AS $$
DECLARE v_actor uuid:=auth.uid(); v_op uuid; v_old jsonb; v_payment public.credit_payments%ROWTYPE;
  v_kind text; v_credit_id uuid; v_paid numeric(14,2); v_total numeric(14,2); v_amount numeric(14,2); v_balance numeric(14,2); v_status text; v_result jsonb;
BEGIN
  IF NOT private.is_active_admin() THEN RAISE EXCEPTION 'business_operation_not_authorized' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(p_request->>'reason',''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'reversal_reason_required' USING ERRCODE='22023'; END IF;
  SELECT operation_id,prior_result INTO v_op,v_old FROM private.reserve_business_operation(v_actor,'payment_reversal',p_request);
  IF v_old IS NOT NULL THEN RETURN v_old; END IF;
  SELECT * INTO STRICT v_payment FROM public.credit_payments WHERE id=(p_request->>'payment_id')::uuid FOR UPDATE;
  v_amount:=v_payment.amount;
  IF EXISTS(SELECT 1 FROM public.payment_reversals WHERE payment_id=v_payment.id) THEN RAISE EXCEPTION 'payment_already_reversed' USING ERRCODE='23505'; END IF;
  IF v_payment.client_credit_id IS NOT NULL THEN
    v_kind:='client'; v_credit_id:=v_payment.client_credit_id;
    SELECT paid,total INTO STRICT v_paid,v_total FROM public.client_credits WHERE id=v_credit_id FOR UPDATE;
  ELSE
    v_kind:='supplier'; v_credit_id:=v_payment.supplier_credit_id;
    SELECT paid,total INTO STRICT v_paid,v_total FROM public.supplier_credits WHERE id=v_credit_id FOR UPDATE;
  END IF;
  IF v_paid<v_amount THEN RAISE EXCEPTION 'credit_payment_ledger_inconsistent' USING ERRCODE='23514'; END IF;
  v_paid:=v_paid-v_amount; v_balance:=v_total-v_paid;
  v_status:=CASE WHEN v_balance=0 THEN 'pagada' WHEN v_paid>0 THEN 'parcial' ELSE 'pendiente' END;
  INSERT INTO public.payment_reversals(payment_id,operation_id,amount) VALUES(v_payment.id,v_op,v_amount);
  IF v_kind='client' THEN UPDATE public.client_credits SET paid=v_paid,balance=v_balance,status=v_status WHERE id=v_credit_id;
  ELSE UPDATE public.supplier_credits SET paid=v_paid,balance=v_balance,status=v_status WHERE id=v_credit_id; END IF;
  INSERT INTO public.financial_compensations(operation_id,actor_id,original_type,original_id,compensation_type,amount,reason)
    VALUES(v_op,v_actor,'payment',v_payment.id,'payment_reversal',v_amount,btrim(p_request->>'reason'));
  v_result:=jsonb_build_object('operation_id',v_op,'document_id',v_payment.id,'document_type','payment','amount',v_amount::text,'reason',btrim(p_request->>'reason'),'compensation_id',v_op);
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
    v_permission:=CASE p_operation_type WHEN 'sale' THEN 'sales' WHEN 'purchase' THEN 'purchases'
      WHEN 'client_payment' THEN 'clients' WHEN 'supplier_payment' THEN 'suppliers' WHEN 'inventory_adjustment' THEN 'inventory' ELSE null END;
    IF v_permission IS NULL THEN RAISE EXCEPTION 'invalid_operation_type' USING ERRCODE='22023'; END IF;
    v_actor:=private.require_business_permission(v_permission);
  END IF;
  SELECT result INTO v_result FROM public.business_operations WHERE actor_id=v_actor AND operation_type=p_operation_type AND idempotency_key=p_idempotency_key;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.annul_financial_document(jsonb),public.reverse_credit_payment(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.annul_financial_document(jsonb),public.reverse_credit_payment(jsonb) TO authenticated;

COMMIT;
