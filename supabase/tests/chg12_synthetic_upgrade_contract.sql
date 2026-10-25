DO $upgrade$
DECLARE
  v_item public.inventory%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_item FROM public.inventory
  WHERE id='12000000-0000-4000-8000-000000000002';
  IF v_item.sku <> 'CHG12-LEGACY-01' OR v_item.name <> 'Synthetic legacy item'
     OR v_item.kind <> 'joya' OR v_item.category <> 'otro'
     OR v_item.cost_price <> 5.25 OR v_item.price <> 8.50 OR v_item.quantity <> 9 THEN
    RAISE EXCEPTION 'legacy inventory identity or commercial values changed';
  END IF;
  IF v_item.brand <> 'Marca anterior' OR v_item.presentation <> '250 ml'
     OR v_item.attributes->'legacy'->>'stone' <> 'Especificación anterior'
     OR (v_item.attributes->'legacy'->>'weight_grams')::numeric <> 1.250
     OR (v_item.attributes->'legacy'->>'stone_carats')::numeric <> 0.200
     OR (v_item.attributes->'legacy'->>'size_mm')::numeric <> 12.500
     OR v_item.attributes->'legacy'->>'size_label' <> 'tamaño anterior' THEN
    RAISE EXCEPTION 'legacy product attributes were not mapped and preserved: %', v_item.attributes;
  END IF;
  IF v_item.metal <> 'Marca anterior' OR v_item.karat <> '250 ml'
     OR v_item.stone_cut <> 'corte anterior' OR v_item.stone_clarity <> 'claridad anterior'
     OR v_item.stone_color <> 'color anterior' THEN
    RAISE EXCEPTION 'legacy columns were removed or modified';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.purchases
    WHERE id='12000000-0000-4000-8000-000000000003'
      AND item_id=v_item.id AND quantity=2 AND unit_cost=4.00 AND total=8.00
  ) THEN RAISE EXCEPTION 'historical purchase relationship or amount changed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sale_lines l JOIN public.sales s ON s.id=l.sale_id
    WHERE l.id='12000000-0000-4000-8000-000000000005'
      AND l.item_id=v_item.id AND l.sku='CHG12-LEGACY-01'
      AND l.name='Historical line snapshot' AND l.unit_price=8.50 AND l.quantity=3
      AND s.total=25.50
  ) THEN RAISE EXCEPTION 'historical sale line snapshot or amount changed'; END IF;
END
$upgrade$;

DO $custom_category$
BEGIN
  INSERT INTO public.inventory(sku,name,category)
  VALUES ('CHG12-UPGRADE-CATEGORY','Synthetic new catalog product','Categoría no prevista');
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory
    WHERE sku='CHG12-UPGRADE-CATEGORY' AND kind='product'
      AND category='Categoría no prevista' AND attributes='{}'::jsonb
      AND is_active AND quantity=0
  ) THEN RAISE EXCEPTION 'new catalog category/default contract failed on upgraded schema'; END IF;
  DELETE FROM public.inventory WHERE sku='CHG12-UPGRADE-CATEGORY';
END
$custom_category$;
