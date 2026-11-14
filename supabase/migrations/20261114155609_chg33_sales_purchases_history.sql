BEGIN;

CREATE FUNCTION public.search_sales_history(
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
    OR NOT (private.has_permission('sales') OR private.has_permission('clients')) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_authorized_for_sales_history';
  END IF;

  IF p_page IS NULL OR p_page < 1 OR p_page > 1000000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_history_page';
  END IF;
  IF (p_from IS NULL) <> (p_to_exclusive IS NULL) OR
     (p_from IS NOT NULL AND p_from >= p_to_exclusive) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_history_date_range';
  END IF;
  IF p_search IS NOT NULL AND char_length(p_search) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'history_search_too_long';
  END IF;

  v_search := nullif(btrim(p_search), '');

  RETURN (
    WITH filtered AS MATERIALIZED (
      SELECT
        s.id,
        s.receipt_no,
        s.client_id,
        s.subtotal,
        s.tax_rate,
        s.tax,
        s.total,
        s.payment_type,
        s.due_date,
        s.created_at,
        s.voided_at,
        s.void_reason,
        s.tax_policy_version,
        s.tax_calculation_enabled,
        coalesce(
          (SELECT c.name FROM public.clients AS c WHERE c.id = s.client_id LIMIT 1),
          (SELECT lookup.name FROM public.sales_client_lookup AS lookup WHERE lookup.id = s.client_id LIMIT 1)
        ) AS client_name,
        coalesce((
          SELECT sum(sl.quantity)::integer
          FROM public.sale_lines AS sl
          WHERE sl.sale_id = s.id
        ), 0)::integer AS piece_count
      FROM public.sales AS s
      WHERE (p_from IS NULL OR s.created_at >= p_from)
        AND (p_to_exclusive IS NULL OR s.created_at < p_to_exclusive)
        AND (
          v_search IS NULL
          OR strpos(lower(s.receipt_no), lower(v_search)) > 0
          OR strpos(lower(s.id::text), lower(v_search)) > 0
          OR EXISTS (
            SELECT 1 FROM public.clients AS c
            WHERE c.id = s.client_id
              AND strpos(lower(c.name), lower(v_search)) > 0
          )
          OR EXISTS (
            SELECT 1 FROM public.sales_client_lookup AS lookup
            WHERE lookup.id = s.client_id
              AND strpos(lower(lookup.name), lower(v_search)) > 0
          )
        )
    ),
    counts AS (
      SELECT count(*)::bigint AS total_count FROM filtered
    ),
    page_rows AS (
      SELECT * FROM filtered
      ORDER BY created_at DESC, id DESC
      LIMIT 25 OFFSET ((p_page - 1) * 25)
    ),
    page_json AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'receipt_no', receipt_no,
            'client_id', client_id,
            'client_name', client_name,
            'subtotal', subtotal,
            'tax_rate', tax_rate,
            'tax', tax,
            'total', total,
            'payment_type', payment_type,
            'due_date', due_date,
            'created_at', created_at,
            'voided_at', voided_at,
            'void_reason', void_reason,
            'tax_policy_version', tax_policy_version,
            'tax_calculation_enabled', tax_calculation_enabled,
            'piece_count', piece_count
          ) ORDER BY created_at DESC, id DESC
        ),
        '[]'::jsonb
      ) AS records
      FROM page_rows
    )
    SELECT jsonb_build_object('total_count', counts.total_count, 'records', page_json.records)
    FROM counts CROSS JOIN page_json
  );
END;
$function$;

CREATE FUNCTION public.search_purchases_history(
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
  IF (p_from IS NULL) <> (p_to_exclusive IS NULL) OR
     (p_from IS NOT NULL AND p_from >= p_to_exclusive) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_history_date_range';
  END IF;
  IF p_search IS NOT NULL AND char_length(p_search) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'history_search_too_long';
  END IF;

  v_search := nullif(btrim(p_search), '');

  RETURN (
    WITH filtered AS MATERIALIZED (
      SELECT
        p.id,
        p.supplier,
        p.supplier_id,
        p.item_id,
        p.description,
        p.quantity,
        p.unit_cost,
        p.total,
        p.payment_type,
        p.invoice_no,
        p.due_date,
        p.created_at,
        p.voided_at,
        p.void_reason
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
    counts AS (
      SELECT count(*)::bigint AS total_count FROM filtered
    ),
    page_rows AS (
      SELECT * FROM filtered
      ORDER BY created_at DESC, id DESC
      LIMIT 25 OFFSET ((p_page - 1) * 25)
    ),
    page_json AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'supplier', supplier,
            'supplier_id', supplier_id,
            'item_id', item_id,
            'description', description,
            'quantity', quantity,
            'unit_cost', unit_cost,
            'total', total,
            'payment_type', payment_type,
            'invoice_no', invoice_no,
            'due_date', due_date,
            'created_at', created_at,
            'voided_at', voided_at,
            'void_reason', void_reason
          ) ORDER BY created_at DESC, id DESC
        ),
        '[]'::jsonb
      ) AS records
      FROM page_rows
    )
    SELECT jsonb_build_object('total_count', counts.total_count, 'records', page_json.records)
    FROM counts CROSS JOIN page_json
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.search_sales_history(text, timestamptz, timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_purchases_history(text, timestamptz, timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_sales_history(text, timestamptz, timestamptz, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_purchases_history(text, timestamptz, timestamptz, integer)
  TO authenticated;

COMMIT;
