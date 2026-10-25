-- CHG-04: A profile cannot become active before its Auth email is confirmed.
BEGIN;

CREATE OR REPLACE FUNCTION public.require_confirmed_auth_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
BEGIN
  IF NEW.active AND NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = NEW.auth_user_id AND u.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'An unverified Auth identity cannot be activated'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER user_profiles_require_confirmed_identity
  BEFORE INSERT OR UPDATE OF auth_user_id, active ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.require_confirmed_auth_identity();

REVOKE ALL ON FUNCTION public.require_confirmed_auth_identity() FROM PUBLIC, anon, authenticated;

COMMIT;
