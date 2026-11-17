-- CHG-35 extension: support non-catalog and mixed purchase lines.
-- Published CHG-35 migration and historical purchase rows remain unchanged.
BEGIN;

ALTER TABLE public.purchase_lines ALTER COLUMN item_id DROP NOT NULL;
ALTER TABLE public.purchase_lines ALTER COLUMN sku_snapshot DROP NOT NULL;
ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_manual_shape_check CHECK (
    (item_id IS NOT NULL AND sku_snapshot IS NOT NULL)
    OR (
      item_id IS NULL
      AND sku_snapshot IS NULL
      AND NOT restocked
      AND char_length(btrim(name_snapshot)) BETWEEN 1 AND 500
    )
  );

CREATE OR REPLACE FUNCTION public.post_purchase(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE
  v_actor uuid := private.require_business_permission('purchases');
  v_op uuid;
  v_old jsonb;
  v_purchase uuid := gen_random_uuid();
  v_credit uuid;
  v_supplier public.suppliers%ROWTYPE;
  v_item public.inventory%ROWTYPE;
  v_line jsonb;
  v_line_count integer;
  v_line_number integer;
  v_quantity integer;
  v_cost numeric;
  v_subtotal numeric;
  v_total numeric(14,2) := 0;
  v_restock boolean := coalesce((p_request->>'restock')::boolean, false);
  v_type text := p_request->>'payment_type';
  v_supplier_name text;
  v_item_id uuid;
  v_manual_name text;
  v_item_ids uuid[] := ARRAY[]::uuid[];
  v_lines jsonb := '[]'::jsonb;
  v_line_json jsonb := '[]'::jsonb;
  v_stock jsonb := '{}'::jsonb;
  v_legacy boolean := NOT (p_request ? 'lines');
  v_result jsonb;
BEGIN
  SELECT operation_id, prior_result INTO v_op, v_old
  FROM private.reserve_business_operation(v_actor, 'purchase', p_request);
  IF v_old IS NOT NULL THEN RETURN v_old; END IF;

  IF v_legacy THEN
    v_lines := jsonb_build_array(jsonb_build_object(
      'item_id', nullif(p_request->>'item_id', ''),
      'quantity', p_request->'quantity',
      'unit_cost', p_request->'unit_cost'
    ));
  ELSE
    IF jsonb_typeof(p_request->'lines') <> 'array' THEN
      RAISE EXCEPTION 'invalid_purchase_lines' USING ERRCODE = '22023';
    END IF;
    v_lines := p_request->'lines';
  END IF;

  v_line_count := jsonb_array_length(v_lines);
  IF v_line_count < 1 OR v_line_count > 100 THEN
    RAISE EXCEPTION 'purchase_line_count_out_of_range' USING ERRCODE = '22023';
  END IF;
  IF v_type NOT IN ('contado', 'credito') THEN
    RAISE EXCEPTION 'invalid_purchase_input' USING ERRCODE = '22023';
  END IF;

  IF nullif(p_request->>'supplier_id', '') IS NOT NULL THEN
    SELECT * INTO STRICT v_supplier FROM public.suppliers
    WHERE id = (p_request->>'supplier_id')::uuid FOR UPDATE;
    IF v_supplier.status <> 'activo' THEN
      RAISE EXCEPTION 'supplier_inactive' USING ERRCODE = '23514';
    END IF;
    v_supplier_name := v_supplier.name;
  ELSE
    v_supplier_name := nullif(btrim(p_request->>'supplier_name'), '');
  END IF;
  IF v_type = 'credito' AND (
    v_supplier.id IS NULL OR nullif(btrim(p_request->>'invoice_no'), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'supplier_credit_requires_supplier_and_invoice' USING ERRCODE = '22023';
  END IF;

  -- Validate every line before locks or writes. Manual lines are snapshots only.
  v_line_number := 0;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    v_line_number := v_line_number + 1;
    IF jsonb_typeof(v_line) <> 'object'
      OR coalesce(v_line->>'quantity', '') !~ '^[0-9]+$'
      OR coalesce(v_line->>'unit_cost', '') !~ '^[0-9]+(\.[0-9]+)?$' THEN
      RAISE EXCEPTION 'invalid_purchase_line' USING ERRCODE = '22023';
    END IF;
    v_quantity := (v_line->>'quantity')::integer;
    v_cost := (v_line->>'unit_cost')::numeric;
    IF v_quantity < 1 OR v_cost < 0 OR v_cost <> round(v_cost, 2)
      OR v_cost > 999999999999.99 THEN
      RAISE EXCEPTION 'invalid_purchase_line_amount' USING ERRCODE = '22023';
    END IF;
    IF nullif(v_line->>'item_id', '') IS NULL THEN
      IF v_legacy THEN
        IF v_restock OR v_line_count <> 1 THEN
          RAISE EXCEPTION 'purchase_line_requires_inventory_item' USING ERRCODE = '22023';
        END IF;
        -- The legacy unlinked request remains a parent-only description purchase.
        v_manual_name := NULL;
      ELSE
        v_manual_name := coalesce(v_line->>'name', v_line->>'manual_name', '');
        IF char_length(v_manual_name) NOT BETWEEN 1 AND 500
          OR char_length(btrim(v_manual_name, ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13))) = 0
          OR v_manual_name <> btrim(v_manual_name, ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)) THEN
          RAISE EXCEPTION 'invalid_manual_purchase_line_name' USING ERRCODE = '22023';
        END IF;
      END IF;
    ELSE
      v_item_id := (v_line->>'item_id')::uuid;
      IF v_item_id = ANY(v_item_ids) THEN
        RAISE EXCEPTION 'duplicate_purchase_item_lines' USING ERRCODE = '22023';
      END IF;
      v_item_ids := array_append(v_item_ids, v_item_id);
    END IF;
    v_subtotal := v_quantity::numeric * v_cost;
    IF v_subtotal > 999999999999.99 OR v_total + v_subtotal > 999999999999.99 THEN
      RAISE EXCEPTION 'purchase_total_out_of_range' USING ERRCODE = '22003';
    END IF;
    v_total := (v_total + v_subtotal)::numeric(14,2);
  END LOOP;

  -- Lock only inventory-backed rows in deterministic order.
  PERFORM i.id
  FROM public.inventory AS i
  JOIN (SELECT unnest(v_item_ids) AS id) AS requested ON requested.id = i.id
  ORDER BY i.id
  FOR UPDATE OF i;
  IF cardinality(v_item_ids) <> (
    SELECT count(*) FROM public.inventory AS i WHERE i.id = ANY(v_item_ids)
  ) THEN
    RAISE EXCEPTION 'inventory_item_not_found' USING ERRCODE = '23503';
  END IF;

  v_line_number := 0;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    v_line_number := v_line_number + 1;
    v_quantity := (v_line->>'quantity')::integer;
    v_cost := (v_line->>'unit_cost')::numeric;
    v_item_id := nullif(v_line->>'item_id', '')::uuid;
    v_subtotal := (v_quantity::numeric * v_cost)::numeric(14,2);
    IF v_item_id IS NOT NULL THEN
      SELECT * INTO STRICT v_item FROM public.inventory WHERE id = v_item_id;
      IF NOT v_item.is_active THEN
        RAISE EXCEPTION 'inventory_item_inactive' USING ERRCODE = '23514';
      END IF;
      IF v_restock AND v_item.quantity::bigint + v_quantity > 2147483647 THEN
        RAISE EXCEPTION 'inventory_quantity_out_of_range' USING ERRCODE = '22003';
      END IF;
      v_line_json := v_line_json || jsonb_build_array(jsonb_build_object(
        'line_number', v_line_number, 'item_id', v_item.id, 'sku', v_item.sku,
        'name', v_item.name, 'quantity', v_quantity, 'unit_cost', v_cost::text,
        'subtotal', v_subtotal::text, 'restocked', v_restock
      ));
      v_stock := v_stock || jsonb_build_object(
        v_item.id::text, CASE WHEN v_restock THEN v_item.quantity + v_quantity ELSE v_item.quantity END
      );
    ELSE
      IF NOT v_legacy THEN
        v_manual_name := coalesce(v_line->>'name', v_line->>'manual_name', '');
        v_line_json := v_line_json || jsonb_build_array(jsonb_build_object(
          'line_number', v_line_number, 'item_id', NULL, 'sku', NULL,
          'name', v_manual_name, 'quantity', v_quantity, 'unit_cost', v_cost::text,
          'subtotal', v_subtotal::text, 'restocked', false
        ));
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.purchases(
    id, supplier, supplier_id, item_id, description, quantity, unit_cost, total,
    payment_type, invoice_no, due_date
  ) VALUES (
    v_purchase, coalesce(v_supplier_name, 'Proveedor no identificado'), v_supplier.id,
    CASE WHEN NOT v_legacy AND v_line_count = 1 THEN nullif(v_line_json->0->>'item_id', '')::uuid
         WHEN v_legacy THEN nullif(v_line_json->0->>'item_id', '')::uuid ELSE NULL END,
    coalesce(p_request->>'description', ''),
    CASE WHEN v_legacy AND cardinality(v_item_ids) = 0 THEN (p_request->>'quantity')::integer
         WHEN v_line_count = 1 THEN (v_line_json->0->>'quantity')::integer ELSE NULL END,
    CASE WHEN v_legacy AND cardinality(v_item_ids) = 0 THEN (p_request->>'unit_cost')::numeric(14,2)
         WHEN v_line_count = 1 THEN (v_line_json->0->>'unit_cost')::numeric(14,2) ELSE NULL END,
    v_total, v_type, nullif(p_request->>'invoice_no', ''), nullif(p_request->>'due_date', '')::date
  );

  IF cardinality(v_item_ids) > 0 OR NOT v_legacy THEN
    INSERT INTO public.purchase_lines(
      purchase_id, line_number, item_id, sku_snapshot, name_snapshot,
      quantity, unit_cost, subtotal, restocked
    )
    SELECT v_purchase, (line->>'line_number')::smallint,
      nullif(line->>'item_id', '')::uuid, nullif(line->>'sku', ''), line->>'name',
      (line->>'quantity')::integer, (line->>'unit_cost')::numeric(14,2),
      (line->>'subtotal')::numeric(14,2), (line->>'restocked')::boolean
    FROM jsonb_array_elements(v_line_json) AS line;
  END IF;

  IF v_restock THEN
    PERFORM set_config('grace.business_operation', 'purchase', true);
    UPDATE public.inventory AS i
    SET quantity = i.quantity + line.quantity
    FROM public.purchase_lines AS line
    WHERE line.purchase_id = v_purchase AND line.restocked AND line.item_id = i.id;
  END IF;

  IF v_type = 'credito' THEN
    v_credit := gen_random_uuid();
    INSERT INTO public.supplier_credits(
      id, purchase_id, supplier_id, supplier_name, invoice_no, total, paid, balance, status, due_date
    ) VALUES (
      v_credit, v_purchase, v_supplier.id, v_supplier.name, p_request->>'invoice_no',
      v_total, 0, v_total, 'pendiente', nullif(p_request->>'due_date', '')::date
    );
  END IF;

  v_result := jsonb_build_object(
    'operation_id', v_op, 'purchase_id', v_purchase, 'supplier_credit_id', v_credit,
    'total', v_total::text, 'stock_quantity', CASE WHEN cardinality(v_item_ids) = 1 AND v_restock
      THEN (v_stock->>v_item_ids[1]::text)::integer ELSE NULL END,
    'stock', v_stock, 'lines', v_line_json
  );
  PERFORM private.finish_business_operation(v_op, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.search_purchases_history(
  p_search text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to_exclusive timestamptz DEFAULT NULL,
  p_page integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_search text;
BEGIN
  IF auth.uid() IS NULL
    OR NOT (private.has_permission('purchases') OR private.has_permission('suppliers')) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authorized_for_purchases_history';
  END IF;
  IF p_page IS NULL OR p_page < 1 OR p_page > 1000000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_history_page';
  END IF;
  IF (p_from IS NULL) <> (p_to_exclusive IS NULL)
    OR (p_from IS NOT NULL AND p_from >= p_to_exclusive) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_history_date_range';
  END IF;
  IF p_search IS NOT NULL AND char_length(p_search) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'history_search_too_long';
  END IF;
  v_search := nullif(btrim(p_search), '');

  RETURN (
    WITH filtered AS MATERIALIZED (
      SELECT p.id, p.supplier, p.supplier_id, p.item_id, p.description, p.quantity,
        p.unit_cost, p.total, p.payment_type, p.invoice_no, p.due_date, p.created_at,
        p.voided_at, p.void_reason
      FROM public.purchases AS p
      WHERE (p_from IS NULL OR p.created_at >= p_from)
        AND (p_to_exclusive IS NULL OR p.created_at < p_to_exclusive)
        AND (
          v_search IS NULL
          OR strpos(lower(p.invoice_no), lower(v_search)) > 0
          OR strpos(lower(p.id::text), lower(v_search)) > 0
          OR strpos(lower(p.supplier), lower(v_search)) > 0
        )
    ),
    counts AS (SELECT count(*)::bigint AS total_count FROM filtered),
    page_rows AS (
      SELECT * FROM filtered ORDER BY created_at DESC, id DESC
      LIMIT 25 OFFSET ((p_page - 1) * 25)
    ),
    page_json AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', p.id, 'supplier', p.supplier, 'supplier_id', p.supplier_id,
            'item_id', p.item_id, 'description', p.description, 'quantity', p.quantity,
            'unit_cost', p.unit_cost, 'total', p.total, 'payment_type', p.payment_type,
            'invoice_no', p.invoice_no, 'due_date', p.due_date, 'created_at', p.created_at,
            'voided_at', p.voided_at, 'void_reason', p.void_reason,
            'line_count', (SELECT count(*)::integer FROM public.purchase_lines AS line
              WHERE line.purchase_id = p.id),
            'line_summary', coalesce((
              SELECT jsonb_agg(jsonb_build_object('name', sample.name_snapshot,
                'quantity', sample.quantity, 'item_id', sample.item_id,
                'kind', CASE WHEN sample.item_id IS NULL THEN 'manual' ELSE 'linked' END)
                ORDER BY sample.line_number)
              FROM (
                SELECT line.line_number, line.name_snapshot, line.quantity, line.item_id
                FROM public.purchase_lines AS line WHERE line.purchase_id = p.id
                ORDER BY line.line_number LIMIT 3
              ) AS sample
            ), '[]'::jsonb)
          ) ORDER BY p.created_at DESC, p.id DESC
        ), '[]'::jsonb
      ) AS records
      FROM page_rows AS p
    )
    SELECT jsonb_build_object('total_count', counts.total_count, 'records', page_json.records)
    FROM counts CROSS JOIN page_json
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.search_purchases_history(text, timestamptz, timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_purchases_history(text, timestamptz, timestamptz, integer)
  TO authenticated;

COMMIT;
