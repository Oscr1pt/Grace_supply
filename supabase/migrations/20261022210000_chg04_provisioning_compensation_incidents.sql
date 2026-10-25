-- CHG-04: durable, server-only evidence when Auth compensation cannot remove a partial identity.
BEGIN;

CREATE TABLE public.provisioning_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL,
  username text NOT NULL,
  incident_type text NOT NULL CHECK (incident_type = 'auth_identity_cleanup_failed'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  details text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamptz,
  CHECK ((status = 'open' AND resolved_by IS NULL AND resolved_at IS NULL)
      OR (status = 'resolved' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);

CREATE UNIQUE INDEX provisioning_incidents_one_open_username
  ON public.provisioning_incidents (username)
  WHERE status = 'open';

ALTER TABLE public.provisioning_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provisioning_incidents FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.provisioning_incidents TO service_role;

COMMIT;
