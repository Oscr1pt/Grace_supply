-- CHG-04: Auth identities are the only application identity source.
-- Existing CHG-03/06 relations remain unchanged; profile creation is server-only.
BEGIN;

ALTER TABLE public.user_profiles
  ALTER COLUMN active SET DEFAULT false,
  ADD CONSTRAINT user_profiles_username_format_check
    CHECK (username ~ '^[A-Za-z0-9._-]{3,64}$'),
  ADD CONSTRAINT user_profiles_permissions_check
    CHECK (permissions <@ ARRAY['dashboard','clients','suppliers','inventory','sales','purchases','expenses','settings']::text[]);

CREATE OR REPLACE FUNCTION public.guard_last_active_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  remaining_admins integer;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.role = 'admin' AND OLD.active
     AND (NEW.role <> 'admin' OR NOT NEW.active) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('grace_supply:last_active_admin', 0));
    SELECT count(*) INTO remaining_admins
    FROM public.user_profiles p
    WHERE p.role = 'admin' AND p.active
      AND p.auth_user_id <> OLD.auth_user_id;
    IF remaining_admins = 0 THEN
      RAISE EXCEPTION 'The last active administrator cannot be revoked or demoted'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.role = 'admin' AND OLD.active THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('grace_supply:last_active_admin', 0));
    SELECT count(*) INTO remaining_admins
    FROM public.user_profiles p
    WHERE p.role = 'admin' AND p.active
      AND p.auth_user_id <> OLD.auth_user_id;
    IF remaining_admins = 0 THEN
      RAISE EXCEPTION 'The last active administrator cannot be deleted'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER user_profiles_last_admin_guard
  BEFORE UPDATE OF role, active OR DELETE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_last_active_admin();

REVOKE ALL ON FUNCTION public.guard_last_active_admin() FROM PUBLIC, anon, authenticated;

COMMIT;
