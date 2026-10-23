-- CHG-00 temporary fail-closed containment. This intentionally disables
-- browser data access until CHG-04/05 provides verified Auth and RLS policies.
-- Apply only after the target project and a tested recovery path are confirmed.

DO $$
DECLARE
  actual_tables text[];
  expected_tables constant text[] := ARRAY[
    'clients', 'inventory', 'purchases', 'sales', 'settings', 'users'
  ];
BEGIN
  SELECT array_agg(c.relname ORDER BY c.relname)
    INTO actual_tables
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');

  IF actual_tables IS DISTINCT FROM expected_tables THEN
    RAISE EXCEPTION
      'CHG-00 precondition failed: expected public tables %, found %',
      expected_tables, actual_tables;
  END IF;

  IF to_regprocedure('graphql_public.graphql(text,text,jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'CHG-00 precondition failed: expected GraphQL entry point is missing';
  END IF;
END
$$;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- There are deliberately no policies here. RLS alone is not an authorization
-- model; it is a temporary deny-all boundary until CHG-04/05 is implemented.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- public has a PUBLIC USAGE grant, so revoke that inherited access as well.
REVOKE USAGE ON SCHEMA public FROM PUBLIC, anon, authenticated;

-- Disable the optional GraphQL API for client roles while preserving the
-- explicit service_role grants observed during the audit.
REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION graphql_public.graphql(text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
