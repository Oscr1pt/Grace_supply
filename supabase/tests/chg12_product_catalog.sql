DO $contract$
DECLARE
  column_count integer;
  item_type text;
  category_is_open boolean;
BEGIN
  SELECT count(*) INTO column_count
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='inventory'
    AND column_name IN ('description','brand','presentation','unit','attributes','is_active');
  IF column_count <> 6 THEN RAISE EXCEPTION 'flexible product columns missing: %', column_count; END IF;

  SELECT column_default INTO item_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='inventory' AND column_name='kind';
  IF item_type NOT LIKE '%product%' THEN RAISE EXCEPTION 'neutral kind default missing: %', item_type; END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.inventory'::regclass AND conname='inventory_category_check'
  ) INTO category_is_open;
  IF NOT category_is_open THEN RAISE EXCEPTION 'legacy fixed category constraint remains'; END IF;

  IF NOT has_column_privilege('authenticated','public.inventory','brand','INSERT')
     OR NOT has_column_privilege('authenticated','public.inventory','attributes','UPDATE') THEN
    RAISE EXCEPTION 'inventory metadata CRUD grants are incomplete';
  END IF;
  IF has_column_privilege('authenticated','public.inventory','quantity','UPDATE')
     OR has_column_privilege('anon','public.inventory','brand','INSERT') THEN
    RAISE EXCEPTION 'catalog migration changed protected stock or anonymous grants';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.inventory'::regclass) THEN
    RAISE EXCEPTION 'inventory RLS is disabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid='public.sales_inventory_lookup'::regclass
      AND reloptions @> ARRAY['security_barrier=true']
  ) THEN RAISE EXCEPTION 'sales inventory view lost its security barrier'; END IF;
  IF to_regprocedure('public.post_sale(jsonb)') IS NULL
     OR to_regprocedure('public.post_purchase(jsonb)') IS NULL
     OR NOT has_function_privilege('authenticated','public.post_sale(jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.post_sale(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'financial RPC availability/grants changed';
  END IF;

  INSERT INTO public.inventory(sku,name,category,description,brand,presentation,unit,attributes,cost_price,price)
  VALUES ('CHG12-CONTRACT','Producto de prueba','Categoría creada por cliente','Descripción','Marca','500 ml','unidad','{"variante":"mate"}',12.50,18.75);
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory
    WHERE sku='CHG12-CONTRACT' AND kind='product' AND category='Categoría creada por cliente'
      AND attributes->>'variante'='mate' AND is_active AND quantity=0
  ) THEN RAISE EXCEPTION 'generic catalog insert/default contract failed'; END IF;
  DELETE FROM public.inventory WHERE sku='CHG12-CONTRACT';
END
$contract$;
