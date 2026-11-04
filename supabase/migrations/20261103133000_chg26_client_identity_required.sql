-- CHG-26: require a document for new authenticated client records while preserving legacy rows.
BEGIN;

CREATE OR REPLACE FUNCTION public.require_client_document_for_authenticated_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'authenticated'
     AND (NEW.rnc IS NULL OR btrim(NEW.rnc) = '') THEN
    RAISE EXCEPTION 'A cédula o RNC es obligatorio para nuevos clientes'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS clients_require_document_for_authenticated_insert ON public.clients;
CREATE TRIGGER clients_require_document_for_authenticated_insert
  BEFORE INSERT ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.require_client_document_for_authenticated_insert();

REVOKE ALL ON FUNCTION public.require_client_document_for_authenticated_insert() FROM PUBLIC, anon, authenticated;

COMMIT;
