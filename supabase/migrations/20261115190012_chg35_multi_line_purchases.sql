-- CHG-35: store purchase product evidence as normalized, immutable snapshots.
-- Legacy scalar purchase columns and requests remain supported; old rows are untouched.
BEGIN;

CREATE TABLE public.purchase_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE RESTRICT,
  line_number smallint NOT NULL CHECK (line_number BETWEEN 1 AND 100),
  item_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
  sku_snapshot text NOT NULL CHECK (length(btrim(sku_snapshot)) > 0),
  name_snapshot text NOT NULL CHECK (length(btrim(name_snapshot)) > 0),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 2147483647),
  unit_cost numeric(14,2) NOT NULL CHECK (unit_cost BETWEEN 0 AND 999999999999.99),
  subtotal numeric(14,2) NOT NULL CHECK (subtotal BETWEEN 0 AND 999999999999.99),
  restocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_lines_purchase_line_unique UNIQUE (purchase_id, line_number),
  CONSTRAINT purchase_lines_purchase_item_unique UNIQUE (purchase_id, item_id)
);

CREATE INDEX purchase_lines_item_id_idx ON public.purchase_lines(item_id);
ALTER TABLE public.purchases ALTER COLUMN quantity DROP NOT NULL;
ALTER TABLE public.purchases ALTER COLUMN unit_cost DROP NOT NULL;

ALTER TABLE public.purchase_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchase_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.purchase_lines TO authenticated;
CREATE POLICY purchase_lines_read ON public.purchase_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchases AS p
      WHERE p.id = purchase_lines.purchase_id
        AND (private.has_permission('purchases') OR private.has_permission('suppliers'))
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

  -- Validate line shape and values before taking inventory locks or writing anything.
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
      IF NOT v_legacy OR v_restock OR v_line_count <> 1 THEN
        RAISE EXCEPTION 'purchase_line_requires_inventory_item' USING ERRCODE = '22023';
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

  -- Lock every referenced stock row in UUID order to keep concurrent postings deadlock-safe.
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
    IF v_item_id IS NOT NULL THEN
      SELECT * INTO STRICT v_item FROM public.inventory WHERE id = v_item_id;
      IF NOT v_item.is_active THEN
        RAISE EXCEPTION 'inventory_item_inactive' USING ERRCODE = '23514';
      END IF;
      IF v_restock AND v_item.quantity::bigint + v_quantity > 2147483647 THEN
        RAISE EXCEPTION 'inventory_quantity_out_of_range' USING ERRCODE = '22003';
      END IF;
      v_subtotal := (v_quantity::numeric * v_cost)::numeric(14,2);
      v_line_json := v_line_json || jsonb_build_array(jsonb_build_object(
        'line_number', v_line_number, 'item_id', v_item.id, 'sku', v_item.sku,
        'name', v_item.name, 'quantity', v_quantity, 'unit_cost', v_cost::text,
        'subtotal', v_subtotal::text, 'restocked', v_restock
      ));
      v_stock := v_stock || jsonb_build_object(
        v_item.id::text, CASE WHEN v_restock THEN v_item.quantity + v_quantity ELSE v_item.quantity END
      );
    END IF;
  END LOOP;

  IF v_legacy AND cardinality(v_item_ids) = 0 AND v_restock THEN
    RAISE EXCEPTION 'restock_requires_inventory_item' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.purchases(
    id, supplier, supplier_id, item_id, description, quantity, unit_cost, total,
    payment_type, invoice_no, due_date
  ) VALUES (
    v_purchase, coalesce(v_supplier_name, 'Proveedor no identificado'), v_supplier.id,
    CASE WHEN v_line_count = 1 THEN (v_line_json->0->>'item_id')::uuid ELSE NULL END,
    coalesce(p_request->>'description', ''),
    CASE WHEN v_legacy AND cardinality(v_item_ids) = 0 THEN (p_request->>'quantity')::integer
         WHEN v_line_count = 1 THEN (v_line_json->0->>'quantity')::integer ELSE NULL END,
    CASE WHEN v_legacy AND cardinality(v_item_ids) = 0 THEN (p_request->>'unit_cost')::numeric(14,2)
         WHEN v_line_count = 1 THEN (v_line_json->0->>'unit_cost')::numeric(14,2) ELSE NULL END,
    v_total, v_type, nullif(p_request->>'invoice_no', ''), nullif(p_request->>'due_date', '')::date
  );

  IF cardinality(v_item_ids) > 0 THEN
    INSERT INTO public.purchase_lines(
      purchase_id, line_number, item_id, sku_snapshot, name_snapshot,
      quantity, unit_cost, subtotal, restocked
    )
    SELECT v_purchase, (line->>'line_number')::smallint, (line->>'item_id')::uuid,
      line->>'sku', line->>'name', (line->>'quantity')::integer,
      (line->>'unit_cost')::numeric(14,2), (line->>'subtotal')::numeric(14,2),
      (line->>'restocked')::boolean
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
                'quantity', sample.quantity) ORDER BY sample.line_number)
              FROM (
                SELECT line.line_number, line.name_snapshot, line.quantity
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

CREATE OR REPLACE FUNCTION public.annul_financial_document(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_op uuid;
  v_old jsonb;
  v_kind text := p_request->>'document_type';
  v_id uuid := (p_request->>'document_id')::uuid;
  v_reason text := btrim(coalesce(p_request->>'reason', ''));
  v_amount numeric(14,2);
  v_result jsonb;
  v_credit record;
  v_line record;
  v_purchase public.purchases%ROWTYPE;
  v_restock boolean;
  v_item public.inventory%ROWTYPE;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'business_operation_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF length(v_reason) NOT BETWEEN 1 AND 500 OR v_kind NOT IN ('sale', 'purchase', 'expense') THEN
    RAISE EXCEPTION 'invalid_annulment_request' USING ERRCODE = '22023';
  END IF;
  SELECT operation_id, prior_result INTO v_op, v_old
  FROM private.reserve_business_operation(v_actor, 'financial_annulment', p_request);
  IF v_old IS NOT NULL THEN RETURN v_old; END IF;

  IF v_kind = 'sale' THEN
    SELECT total INTO STRICT v_amount FROM public.sales WHERE id = v_id AND voided_at IS NULL FOR UPDATE;
    SELECT * INTO v_credit FROM public.client_credits WHERE sale_id = v_id FOR UPDATE;
    IF FOUND AND v_credit.paid > 0 THEN
      RAISE EXCEPTION 'active_payments_require_reversal' USING ERRCODE = '23514';
    END IF;
    FOR v_line IN
      SELECT item_id, sum(quantity)::integer AS qty FROM public.sale_lines
      WHERE sale_id = v_id GROUP BY item_id ORDER BY item_id
    LOOP
      SELECT * INTO STRICT v_item FROM public.inventory WHERE id = v_line.item_id FOR UPDATE;
      PERFORM set_config('grace.business_operation', 'financial_annulment', true);
      UPDATE public.inventory SET quantity = quantity + v_line.qty WHERE id = v_item.id;
    END LOOP;
    IF v_credit.id IS NOT NULL THEN
      UPDATE public.client_credits SET voided_principal = total, balance = 0, status = 'anulada'
      WHERE id = v_credit.id;
    END IF;
    UPDATE public.sales SET voided_at = clock_timestamp(), voided_by = v_actor, void_reason = v_reason
    WHERE id = v_id;
  ELSIF v_kind = 'purchase' THEN
    SELECT * INTO STRICT v_purchase FROM public.purchases
    WHERE id = v_id AND voided_at IS NULL FOR UPDATE;
    v_amount := v_purchase.total;
    SELECT * INTO v_credit FROM public.supplier_credits WHERE purchase_id = v_id FOR UPDATE;
    IF FOUND AND v_credit.paid > 0 THEN
      RAISE EXCEPTION 'active_payments_require_reversal' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (SELECT 1 FROM public.purchase_lines WHERE purchase_id = v_id) THEN
      PERFORM i.id
      FROM public.inventory AS i
      JOIN (
        SELECT item_id, sum(quantity)::bigint AS qty
        FROM public.purchase_lines
        WHERE purchase_id = v_id AND restocked
        GROUP BY item_id
      ) AS lines ON lines.item_id = i.id
      ORDER BY i.id
      FOR UPDATE OF i;
      IF EXISTS (
        SELECT 1 FROM public.inventory AS i
        JOIN (
          SELECT item_id, sum(quantity)::bigint AS qty
          FROM public.purchase_lines
          WHERE purchase_id = v_id AND restocked
          GROUP BY item_id
        ) AS lines ON lines.item_id = i.id
        WHERE i.quantity < lines.qty
      ) THEN
        RAISE EXCEPTION 'insufficient_stock_for_annulment' USING ERRCODE = '23514';
      END IF;
      PERFORM set_config('grace.business_operation', 'financial_annulment', true);
      UPDATE public.inventory AS i
      SET quantity = i.quantity - lines.qty::integer
      FROM (
        SELECT item_id, sum(quantity)::bigint AS qty
        FROM public.purchase_lines
        WHERE purchase_id = v_id AND restocked
        GROUP BY item_id
      ) AS lines
      WHERE i.id = lines.item_id;
    ELSE
      -- Pre-CHG-35 fallback: preserve the original operation-request/scalar reversal.
      SELECT (request->>'restock')::boolean INTO v_restock
      FROM public.business_operations
      WHERE result->>'purchase_id' = v_id::text AND operation_type = 'purchase';
      IF coalesce(v_restock, false) AND v_purchase.item_id IS NOT NULL THEN
        SELECT * INTO STRICT v_item FROM public.inventory WHERE id = v_purchase.item_id FOR UPDATE;
        IF v_item.quantity < v_purchase.quantity THEN
          RAISE EXCEPTION 'insufficient_stock_for_annulment' USING ERRCODE = '23514';
        END IF;
        PERFORM set_config('grace.business_operation', 'financial_annulment', true);
        UPDATE public.inventory SET quantity = quantity - v_purchase.quantity WHERE id = v_item.id;
      END IF;
    END IF;

    IF v_credit.id IS NOT NULL THEN
      UPDATE public.supplier_credits SET voided_principal = total, balance = 0, status = 'anulada'
      WHERE id = v_credit.id;
    END IF;
    UPDATE public.purchases SET voided_at = clock_timestamp(), voided_by = v_actor, void_reason = v_reason
    WHERE id = v_id;
  ELSE
    SELECT amount INTO STRICT v_amount FROM public.expenses
    WHERE id = v_id AND status = 'registrado' FOR UPDATE;
    UPDATE public.expenses SET status = 'anulado', updated_at = clock_timestamp(),
      voided_at = clock_timestamp(), voided_by = v_actor, void_reason = v_reason WHERE id = v_id;
  END IF;

  INSERT INTO public.financial_compensations(
    operation_id, actor_id, original_type, original_id, compensation_type, amount, reason
  ) VALUES (v_op, v_actor, v_kind, v_id, 'annulment', v_amount, v_reason);
  v_result := jsonb_build_object(
    'operation_id', v_op, 'document_type', v_kind, 'document_id', v_id,
    'amount', v_amount::text, 'reason', v_reason, 'compensation_id', v_op
  );
  PERFORM private.finish_business_operation(v_op, v_result);
  RETURN v_result;
END
$function$;

REVOKE ALL ON FUNCTION public.post_purchase(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_purchase(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.annul_financial_document(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.annul_financial_document(jsonb) TO authenticated;

COMMIT;
