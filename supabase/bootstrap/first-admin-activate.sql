-- Operator-only template. Run only after the invitee confirms the Auth email.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('grace_supply:first_admin_bootstrap', 0));
DO $activation$
DECLARE
  invited_auth_id uuid := '__AUTH_USER_ID__'::uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = invited_auth_id AND email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'matching Auth identity is not confirmed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE auth_user_id = invited_auth_id AND role = 'admin' AND active = false
  ) THEN
    RAISE EXCEPTION 'expected inactive first-admin profile was not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE role = 'admin' AND active = true AND auth_user_id <> invited_auth_id
  ) THEN
    RAISE EXCEPTION 'another active administrator already exists';
  END IF;
  UPDATE public.user_profiles SET active = true
  WHERE auth_user_id = invited_auth_id AND role = 'admin' AND active = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'activation did not update exactly one profile'; END IF;
END
$activation$;
COMMIT;
