-- CHG-31: employee sessions must be able to read the server-controlled
-- password setup flag while retaining column-level profile protections.
GRANT SELECT (password_change_required)
  ON public.user_profiles TO authenticated;
