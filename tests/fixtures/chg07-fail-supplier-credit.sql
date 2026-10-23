CREATE OR REPLACE FUNCTION public.chg07_test_fail_supplier_credit()
RETURNS trigger LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.invoice_no LIKE 'CHG07-FAIL-%' THEN
    RAISE EXCEPTION 'synthetic_chg07_credit_write_failure' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS chg07_test_fail_supplier_credit ON public.supplier_credits;
CREATE TRIGGER chg07_test_fail_supplier_credit
BEFORE INSERT ON public.supplier_credits
FOR EACH ROW EXECUTE FUNCTION public.chg07_test_fail_supplier_credit();

CREATE OR REPLACE FUNCTION public.chg07_test_fail_sale_line()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.sku LIKE 'CHG07-FAILSALE-%' THEN
    RAISE EXCEPTION 'synthetic_chg07_sale_line_failure' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS chg07_test_fail_sale_line ON public.sale_lines;
CREATE TRIGGER chg07_test_fail_sale_line BEFORE INSERT ON public.sale_lines
FOR EACH ROW EXECUTE FUNCTION public.chg07_test_fail_sale_line();

CREATE OR REPLACE FUNCTION public.chg07_test_fail_client_credit_update()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.due_date=DATE '1999-01-01' AND (NEW.paid IS DISTINCT FROM OLD.paid OR NEW.balance IS DISTINCT FROM OLD.balance) THEN
    RAISE EXCEPTION 'synthetic_chg07_credit_update_failure' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS chg07_test_fail_client_credit_update ON public.client_credits;
CREATE TRIGGER chg07_test_fail_client_credit_update BEFORE UPDATE ON public.client_credits
FOR EACH ROW EXECUTE FUNCTION public.chg07_test_fail_client_credit_update();

CREATE OR REPLACE FUNCTION public.chg07_test_fail_inventory_adjustment()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF auth.role()<>'service_role' AND NEW.sku LIKE 'CHG07-FAILADJUST-%' AND NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    RAISE EXCEPTION 'synthetic_chg07_inventory_adjustment_failure' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS chg07_test_fail_inventory_adjustment ON public.inventory;
CREATE TRIGGER chg07_test_fail_inventory_adjustment BEFORE UPDATE OF quantity ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.chg07_test_fail_inventory_adjustment();

CREATE OR REPLACE FUNCTION public.chg07_test_delay_purchase()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.invoice_no LIKE 'CHG07-BEFORE-%' THEN
    PERFORM pg_sleep(4);
  END IF;
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS chg07_test_delay_purchase ON public.purchases;
CREATE TRIGGER chg07_test_delay_purchase BEFORE INSERT ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.chg07_test_delay_purchase();
