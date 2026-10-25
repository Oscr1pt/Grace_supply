-- CHG-00 follow-up: PostgreSQL's built-in global default grants EXECUTE on
-- newly created routines to PUBLIC. A schema-scoped REVOKE cannot remove
-- that global default, so suppress it for future routines created by postgres.
-- Explicit grants must be added by later changes for functions that are meant
-- to be callable by authenticated application roles.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles creator ON creator.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE creator.rolname = 'postgres'
      AND d.defaclnamespace = 0
      AND d.defaclobjtype = 'f'
      AND a.grantee = 0
      AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC retains global EXECUTE default for postgres-created functions';
  END IF;
END
$$;
