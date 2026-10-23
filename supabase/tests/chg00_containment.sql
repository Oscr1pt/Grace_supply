-- CHG-00 security assertions. This file does not change the applied migration
-- history and never reads application rows. The synthetic relation is rolled
-- back inside a PL/pgSQL subtransaction.
DO $$
DECLARE
  routine_oid oid;
  probe_oid oid;
  stats_owner text;
  stats_info_owner text;
  anon_schema jsonb;
  authenticated_schema jsonb;
  anon_read jsonb;
  authenticated_read jsonb;
  anon_mutation jsonb;
  authenticated_mutation jsonb;
  anon_rest_select_denied boolean := false;
  anon_rest_insert_denied boolean := false;
  authenticated_rest_select_denied boolean := false;
  authenticated_rest_insert_denied boolean := false;
  anon_rpc_denied boolean := false;
  authenticated_rpc_denied boolean := false;
BEGIN
  IF has_schema_privilege('anon', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'anon still has USAGE on public';
  END IF;
  IF has_schema_privilege('authenticated', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'authenticated still has USAGE on public before CHG-04/05';
  END IF;
  IF NOT has_schema_privilege('service_role', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'service_role lost USAGE on public';
  END IF;

  SELECT p.oid INTO routine_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  LIMIT 1;
  IF routine_oid IS NOT NULL AND (
      has_function_privilege('anon', routine_oid, 'EXECUTE')
      OR has_function_privilege('authenticated', routine_oid, 'EXECUTE')) THEN
    RAISE EXCEPTION 'client role can execute public.rls_auto_enable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    JOIN pg_roles creator ON creator.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    JOIN pg_roles grantee ON grantee.oid = a.grantee
    WHERE n.nspname = 'public' AND creator.rolname = 'postgres'
      AND grantee.rolname IN ('anon', 'authenticated')
      AND ((d.defaclobjtype = 'r' AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))
        OR (d.defaclobjtype = 'S' AND a.privilege_type IN ('USAGE','SELECT','UPDATE'))
        OR (d.defaclobjtype = 'f' AND a.privilege_type = 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'client roles retain permissive default privileges for postgres-created public objects';
  END IF;

  IF has_table_privilege('anon', 'extensions.pg_stat_statements', 'SELECT')
     OR has_table_privilege('authenticated', 'extensions.pg_stat_statements', 'SELECT')
     OR has_table_privilege('anon', 'extensions.pg_stat_statements_info', 'SELECT')
     OR has_table_privilege('authenticated', 'extensions.pg_stat_statements_info', 'SELECT') THEN
    SELECT pg_get_userbyid(c.relowner) INTO stats_owner
    FROM pg_class c WHERE c.oid = 'extensions.pg_stat_statements'::regclass;
    SELECT pg_get_userbyid(c.relowner) INTO stats_info_owner
    FROM pg_class c WHERE c.oid = 'extensions.pg_stat_statements_info'::regclass;
    IF (has_table_privilege('anon', 'extensions.pg_stat_statements', 'SELECT')
        OR has_table_privilege('authenticated', 'extensions.pg_stat_statements', 'SELECT'))
       AND stats_owner <> 'supabase_admin' THEN
      RAISE EXCEPTION 'client role can read pg_stat_statements outside the managed owner ACL';
    END IF;
    IF (has_table_privilege('anon', 'extensions.pg_stat_statements_info', 'SELECT')
        OR has_table_privilege('authenticated', 'extensions.pg_stat_statements_info', 'SELECT'))
       AND stats_info_owner <> 'supabase_admin' THEN
      RAISE EXCEPTION 'client role can read pg_stat_statements_info outside the managed owner ACL';
    END IF;
    IF stats_owner = 'supabase_admin' OR stats_info_owner = 'supabase_admin' THEN
      RAISE NOTICE 'SKIP managed statistics ACL assertion: client visibility comes from an ACL on an object owned by supabase_admin, outside this migration role';
    ELSE
      RAISE EXCEPTION 'client role can read extension statistics views';
    END IF;
  END IF;
  IF NOT has_table_privilege('service_role', 'extensions.pg_stat_statements', 'SELECT')
     OR NOT has_table_privilege('service_role', 'extensions.pg_stat_statements_info', 'SELECT') THEN
    RAISE EXCEPTION 'service_role lost access to extension statistics views';
  END IF;

  -- A callable GraphQL entry point is not itself evidence of data access.
  -- Check effective table access and GraphQL's visible query/mutation fields
  -- under both client roles using a synthetic relation and forced rollback.
  IF to_regclass('public.chg00_graphql_access_probe') IS NOT NULL THEN
    RAISE EXCEPTION 'synthetic GraphQL probe relation already exists';
  END IF;

  BEGIN
    CREATE TABLE public.chg00_graphql_access_probe (
      id integer PRIMARY KEY,
      secret text NOT NULL
    );
    -- The local platform stack does not install the hosted ensure_rls event
    -- trigger. Make this synthetic fixture deterministic in both places.
    ALTER TABLE public.chg00_graphql_access_probe ENABLE ROW LEVEL SECURITY;
    INSERT INTO public.chg00_graphql_access_probe VALUES (1, 'synthetic-only');
    CREATE FUNCTION public.chg00_rpc_access_probe()
    RETURNS text LANGUAGE sql IMMUTABLE AS 'SELECT ''synthetic-rpc''::text';

    SELECT c.oid INTO probe_oid FROM pg_class c
    WHERE c.oid = 'public.chg00_graphql_access_probe'::regclass;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = probe_oid) THEN
      RAISE EXCEPTION 'RLS was not enabled for synthetic public relation';
    END IF;

    IF has_table_privilege('anon', probe_oid, 'SELECT')
       OR has_table_privilege('anon', probe_oid, 'INSERT')
       OR has_table_privilege('anon', probe_oid, 'UPDATE')
       OR has_table_privilege('anon', probe_oid, 'DELETE') THEN
      RAISE EXCEPTION 'anon received direct privileges on synthetic relation';
    END IF;
    IF has_table_privilege('authenticated', probe_oid, 'SELECT')
       OR has_table_privilege('authenticated', probe_oid, 'INSERT')
       OR has_table_privilege('authenticated', probe_oid, 'UPDATE')
       OR has_table_privilege('authenticated', probe_oid, 'DELETE') THEN
      RAISE EXCEPTION 'authenticated received direct privileges on synthetic relation';
    END IF;
    IF has_function_privilege('anon', 'public.chg00_rpc_access_probe()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.chg00_rpc_access_probe()', 'EXECUTE') THEN
      RAISE EXCEPTION 'client role received EXECUTE on synthetic RPC';
    END IF;

    SET LOCAL ROLE anon;
    BEGIN
      EXECUTE 'SELECT secret FROM public.chg00_graphql_access_probe';
    EXCEPTION WHEN insufficient_privilege THEN
      anon_rest_select_denied := true;
    END;
    BEGIN
      EXECUTE 'INSERT INTO public.chg00_graphql_access_probe VALUES (4, ''rest-write'')';
    EXCEPTION WHEN insufficient_privilege THEN
      anon_rest_insert_denied := true;
    END;
    BEGIN
      PERFORM public.chg00_rpc_access_probe();
    EXCEPTION WHEN insufficient_privilege THEN
      anon_rpc_denied := true;
    END;
    RESET ROLE;

    SET LOCAL ROLE authenticated;
    BEGIN
      EXECUTE 'SELECT secret FROM public.chg00_graphql_access_probe';
    EXCEPTION WHEN insufficient_privilege THEN
      authenticated_rest_select_denied := true;
    END;
    BEGIN
      EXECUTE 'INSERT INTO public.chg00_graphql_access_probe VALUES (5, ''rest-write'')';
    EXCEPTION WHEN insufficient_privilege THEN
      authenticated_rest_insert_denied := true;
    END;
    BEGIN
      PERFORM public.chg00_rpc_access_probe();
    EXCEPTION WHEN insufficient_privilege THEN
      authenticated_rpc_denied := true;
    END;
    RESET ROLE;

    IF NOT anon_rest_select_denied OR NOT anon_rest_insert_denied OR NOT anon_rpc_denied THEN
      RAISE EXCEPTION 'anon could access synthetic REST/RPC resource';
    END IF;
    IF NOT authenticated_rest_select_denied OR NOT authenticated_rest_insert_denied
       OR NOT authenticated_rpc_denied THEN
      RAISE EXCEPTION 'authenticated could access synthetic REST/RPC resource';
    END IF;

    IF to_regprocedure('graphql_public.graphql(text,text,jsonb,jsonb)') IS NOT NULL
       AND has_function_privilege('anon', 'graphql_public.graphql(text,text,jsonb,jsonb)', 'EXECUTE')
       AND has_function_privilege('authenticated', 'graphql_public.graphql(text,text,jsonb,jsonb)', 'EXECUTE') THEN
      SET LOCAL ROLE anon;
      SELECT graphql_public.graphql(
        NULL,
        'query { __schema { queryType { fields { name } } mutationType { fields { name } } } }',
        '{}'::jsonb, '{}'::jsonb
      ) INTO anon_schema;
      SELECT graphql_public.graphql(
        NULL,
        'query { chg00GraphqlAccessProbeCollection { edges { node { id secret } } } }',
        '{}'::jsonb, '{}'::jsonb
      ) INTO anon_read;
      SELECT graphql_public.graphql(
        NULL,
        'mutation { insertIntoChg00GraphqlAccessProbeCollection(objects: [{ id: 2, secret: "written-by-anon" }]) { records { id secret } } }',
        '{}'::jsonb, '{}'::jsonb
      ) INTO anon_mutation;
      RESET ROLE;

      SET LOCAL ROLE authenticated;
      SELECT graphql_public.graphql(
        NULL,
        'query { __schema { queryType { fields { name } } mutationType { fields { name } } } }',
        '{}'::jsonb, '{}'::jsonb
      ) INTO authenticated_schema;
      SELECT graphql_public.graphql(
        NULL,
        'query { chg00GraphqlAccessProbeCollection { edges { node { id secret } } } }',
        '{}'::jsonb, '{}'::jsonb
      ) INTO authenticated_read;
      SELECT graphql_public.graphql(
        NULL,
        'mutation { insertIntoChg00GraphqlAccessProbeCollection(objects: [{ id: 3, secret: "written-by-authenticated" }]) { records { id secret } } }',
        '{}'::jsonb, '{}'::jsonb
      ) INTO authenticated_mutation;
      RESET ROLE;

      IF anon_schema IS NULL OR authenticated_schema IS NULL
         OR anon_read IS NULL OR authenticated_read IS NULL
         OR anon_mutation IS NULL OR authenticated_mutation IS NULL THEN
        RAISE EXCEPTION 'GraphQL returned no result for a client role';
      END IF;
      IF anon_schema::text ILIKE '%chg00GraphqlAccessProbe%'
         OR authenticated_schema::text ILIKE '%chg00GraphqlAccessProbe%' THEN
        RAISE EXCEPTION 'synthetic relation is exposed through GraphQL to a client role';
      END IF;
      IF anon_read::text ILIKE '%synthetic-only%'
         OR authenticated_read::text ILIKE '%synthetic-only%' THEN
        RAISE EXCEPTION 'a client role read the synthetic private row through GraphQL';
      END IF;
      IF anon_mutation::text ILIKE '%written-by-anon%'
         OR authenticated_mutation::text ILIKE '%written-by-authenticated%' THEN
        RAISE EXCEPTION 'a client role wrote the synthetic relation through GraphQL';
      END IF;
    END IF;

    RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'intentional rollback of CHG-00 synthetic probe';
  EXCEPTION
    WHEN SQLSTATE 'ZX001' THEN
      NULL;
  END;

  IF to_regclass('public.chg00_graphql_access_probe') IS NOT NULL THEN
    RAISE EXCEPTION 'synthetic GraphQL probe relation persisted after rollback';
  END IF;
  IF to_regprocedure('public.chg00_rpc_access_probe()') IS NOT NULL THEN
    RAISE EXCEPTION 'synthetic RPC probe function persisted after rollback';
  END IF;
END
$$;
