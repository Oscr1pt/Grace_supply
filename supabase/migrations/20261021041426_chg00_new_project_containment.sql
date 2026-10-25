-- CHG-00 deny-client baseline for the newly provisioned, empty dev project.
-- No application tables or business rows are created, changed, or removed.
-- Authenticated access remains closed until CHG-04/05 defines explicit grants.

DO $$
DECLARE
  public_relations text[];
BEGIN
  SELECT array_agg(c.relname ORDER BY c.relname)
    INTO public_relations
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f');

  IF public_relations IS NOT NULL THEN
    RAISE EXCEPTION
      'CHG-00 precondition failed: expected no public application relations, found %',
      public_relations;
  END IF;

  IF to_regprocedure('graphql_public.graphql(text,text,jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'CHG-00 precondition failed: expected GraphQL entry point is missing';
  END IF;

  IF to_regclass('extensions.pg_stat_statements') IS NULL
     OR to_regclass('extensions.pg_stat_statements_info') IS NULL THEN
    RAISE EXCEPTION 'CHG-00 precondition failed: expected extension statistics views are missing';
  END IF;
END
$$;

-- Deny client roles access through the REST schema until CHG-04/05 supplies
-- the intended authenticated authorization model.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE USAGE ON SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- Close the optional GraphQL endpoint to all client roles.
REVOKE USAGE ON SCHEMA graphql_public FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION graphql_public.graphql(text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA graphql_public TO service_role;

-- Query statistics can expose SQL text and operational metadata.
REVOKE SELECT ON TABLE extensions.pg_stat_statements,
  extensions.pg_stat_statements_info FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE extensions.pg_stat_statements,
  extensions.pg_stat_statements_info TO service_role;

-- Supabase's current default grants give client roles broad access to objects
-- created by postgres in public. Remove them for future application objects.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC, anon, authenticated;
