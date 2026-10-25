-- CHG-05: Permit profile linkage filters while row-level policy keeps employee
-- reads scoped to the authenticated identity (admins may view the roster).
GRANT SELECT (auth_user_id) ON public.user_profiles TO authenticated;
