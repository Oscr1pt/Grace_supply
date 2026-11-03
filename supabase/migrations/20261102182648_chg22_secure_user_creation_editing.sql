-- CHG-22: contact phone and a server-only initial-password completion gate.
BEGIN;

ALTER TABLE public.user_profiles
  ADD COLUMN phone text,
  ADD COLUMN password_change_required boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT user_profiles_phone_format_check CHECK (
    phone IS NULL OR (
      phone = btrim(phone)
      AND length(phone) <= 30
      AND phone ~ '^[+0-9(). -]+$'
      AND length(regexp_replace(phone, '[^0-9]', '', 'g')) BETWEEN 7 AND 15
    )
  );

COMMENT ON COLUMN public.user_profiles.password_change_required IS
  'Server-only gate: an administrator-created account cannot be activated until the invited user changes the initial password through the trusted Edge Function.';

-- Existing row-level policy limits this column to the caller's own profile or an active admin.
-- No authenticated UPDATE grant is added; writes stay behind manage-profile.
GRANT SELECT (phone) ON public.user_profiles TO authenticated;

COMMIT;
