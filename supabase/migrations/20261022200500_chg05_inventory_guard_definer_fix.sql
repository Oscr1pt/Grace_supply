-- CHG-05: Run the trigger guard with its fixed owner path while retaining the
-- request's Auth role. Service-role use remains server-only and cannot be sent
-- to the browser.
BEGIN;

CREATE OR REPLACE FUNCTION private.guard_inventory_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE
  is_server_role boolean := auth.role() = 'service_role';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.quantity <> 0 THEN
      RAISE EXCEPTION 'Stock must be changed through an authorized purchase operation'
        USING ERRCODE = '42501';
    END IF;
    IF NOT is_server_role AND NOT private.is_active_admin()
       AND (NEW.price <> 0 OR NEW.cost_price <> 0) THEN
      RAISE EXCEPTION 'Only an active administrator may set inventory prices'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    RAISE EXCEPTION 'Stock must be changed through an authorized business operation'
      USING ERRCODE = '42501';
  END IF;
  IF NOT is_server_role AND NOT private.is_active_admin()
     AND (NEW.price IS DISTINCT FROM OLD.price OR NEW.cost_price IS DISTINCT FROM OLD.cost_price) THEN
    RAISE EXCEPTION 'Only an active administrator may change inventory prices'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION private.guard_inventory_protected_fields() FROM PUBLIC, anon, authenticated;

COMMIT;
