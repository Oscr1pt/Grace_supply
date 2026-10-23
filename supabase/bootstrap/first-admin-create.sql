-- Operator-only template. Replace UUID and text placeholders after validating the
-- target project's ref and the invited identity in Supabase Auth.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('grace_supply:first_admin_bootstrap', 0));
DO $bootstrap$
DECLARE
  invited_auth_id uuid := '__AUTH_USER_ID__'::uuid;
  bootstrap_username text := '__USERNAME__';
  bootstrap_name text := '__DISPLAY_NAME__';
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_profiles) THEN
    RAISE EXCEPTION 'first-admin bootstrap is single use: user_profiles is not empty';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = invited_auth_id) THEN
    RAISE EXCEPTION 'invited Auth identity does not exist';
  END IF;
  IF bootstrap_username !~ '^[A-Za-z0-9_]{3,32}$' OR length(trim(bootstrap_name)) = 0 THEN
    RAISE EXCEPTION 'invalid username or display name';
  END IF;
  INSERT INTO public.user_profiles
    (auth_user_id, username, name, role, permissions, active)
  VALUES
    (invited_auth_id, bootstrap_username, bootstrap_name, 'admin',
     ARRAY['dashboard','clients','suppliers','inventory','sales','purchases','expenses','settings'], false);
END
$bootstrap$;
COMMIT;
