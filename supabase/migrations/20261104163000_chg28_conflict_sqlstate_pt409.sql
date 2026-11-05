-- CHG-28: commercial conflicts are HTTP 409 conflicts, not serialization failures.
-- Forward-only; preserve genuine PostgreSQL 40001 serialization errors.
BEGIN;

DO $migration$
DECLARE
  v_definition text;
  v_expected text;
  v_replacement text;
BEGIN
  v_expected := $$RAISE EXCEPTION 'catalog_price_conflict' USING ERRCODE='40001';$$;
  v_replacement := $$RAISE EXCEPTION 'catalog_price_conflict' USING ERRCODE='PT409';$$;
  SELECT pg_get_functiondef('public.post_sale(jsonb)'::regprocedure) INTO v_definition;
  IF position(v_expected IN v_definition) = 0 THEN
    RAISE EXCEPTION 'chg28_post_sale_conflict_clause_not_found';
  END IF;
  EXECUTE replace(v_definition, v_expected, v_replacement);

  v_expected := $$RAISE EXCEPTION 'inventory_version_conflict' USING ERRCODE = '40001';$$;
  v_replacement := $$RAISE EXCEPTION 'inventory_version_conflict' USING ERRCODE = 'PT409';$$;
  SELECT pg_get_functiondef('public.adjust_inventory(jsonb)'::regprocedure) INTO v_definition;
  IF position(v_expected IN v_definition) = 0 THEN
    RAISE EXCEPTION 'chg28_adjust_inventory_conflict_clause_not_found';
  END IF;
  EXECUTE replace(v_definition, v_expected, v_replacement);
END
$migration$;

COMMIT;
