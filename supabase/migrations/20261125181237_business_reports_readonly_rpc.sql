BEGIN;

CREATE OR REPLACE FUNCTION public.get_business_report(
  p_period_type text,
  p_anchor_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_start_date date;
  v_end_date date;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_sales_subtotal numeric;
  v_sales_tax numeric;
  v_operating_expenses numeric;
  v_merchandise_purchases numeric;
  v_sale_count bigint;
  v_expense_count bigint;
  v_purchase_count bigint;
  v_buckets jsonb;
  v_categories jsonb;
  v_anchor text;
  v_generated_at text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'business_report_not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_anchor_date IS NULL OR p_period_type IS NULL OR p_period_type NOT IN ('week', 'month', 'year') THEN
    RAISE EXCEPTION 'invalid_business_report_period' USING ERRCODE = '22023';
  END IF;

  IF p_period_type = 'week' THEN
    v_start_date := date_trunc('week', p_anchor_date::timestamp)::date;
    v_end_date := v_start_date + 7;
    v_anchor := p_anchor_date::text;
  ELSIF p_period_type = 'month' THEN
    v_start_date := date_trunc('month', p_anchor_date::timestamp)::date;
    v_end_date := (v_start_date + interval '1 month')::date;
    v_anchor := to_char(v_start_date, 'YYYY-MM');
  ELSE
    v_start_date := make_date(extract(year FROM p_anchor_date)::integer, 1, 1);
    v_end_date := (v_start_date + interval '1 year')::date;
    v_anchor := to_char(v_start_date, 'YYYY');
  END IF;

  -- Business dates define the calendar interval; timestamp columns are compared
  -- against local midnight converted to instants, using a half-open range.
  v_start_at := v_start_date::timestamp AT TIME ZONE 'America/Santo_Domingo';
  v_end_at := v_end_date::timestamp AT TIME ZONE 'America/Santo_Domingo';

  SELECT coalesce(sum(s.subtotal), 0.00::numeric), coalesce(sum(s.tax), 0.00::numeric), count(*)
    INTO v_sales_subtotal, v_sales_tax, v_sale_count
  FROM public.sales AS s
  WHERE s.voided_at IS NULL
    AND s.created_at >= v_start_at
    AND s.created_at < v_end_at;

  SELECT coalesce(sum(p.total), 0.00::numeric), count(*)
    INTO v_merchandise_purchases, v_purchase_count
  FROM public.purchases AS p
  WHERE p.voided_at IS NULL
    AND p.created_at >= v_start_at
    AND p.created_at < v_end_at;

  SELECT coalesce(sum(e.amount), 0.00::numeric), count(*)
    INTO v_operating_expenses, v_expense_count
  FROM public.expenses AS e
  WHERE e.status = 'registrado'
    AND e.voided_at IS NULL
    AND e.date >= v_start_date
    AND e.date < v_end_date;

  WITH expense_totals AS (
    SELECT e.category, sum(e.amount) AS amount
    FROM public.expenses AS e
    WHERE e.status = 'registrado'
      AND e.voided_at IS NULL
      AND e.date >= v_start_date
      AND e.date < v_end_date
    GROUP BY e.category
  )
  SELECT coalesce(
    jsonb_agg(jsonb_build_object(
      'category', category,
      'label', CASE category
        WHEN 'nomina' THEN 'Nómina'
        WHEN 'alquiler' THEN 'Alquiler'
        WHEN 'electricidad' THEN 'Electricidad'
        WHEN 'agua' THEN 'Agua'
        WHEN 'internet' THEN 'Internet'
        WHEN 'telefono' THEN 'Teléfono'
        WHEN 'transporte' THEN 'Transporte'
        WHEN 'combustible' THEN 'Combustible'
        WHEN 'mantenimiento' THEN 'Mantenimiento'
        WHEN 'papeleria' THEN 'Papelería'
        WHEN 'limpieza' THEN 'Limpieza'
        WHEN 'publicidad' THEN 'Publicidad'
        WHEN 'servicios_profesionales' THEN 'Servicios profesionales'
        WHEN 'comisiones' THEN 'Comisiones'
        WHEN 'impuestos' THEN 'Impuestos'
        WHEN 'otros' THEN 'Otros gastos operativos'
        ELSE category
      END,
      'amount', amount::text
    ) ORDER BY category), '[]'::jsonb)
    INTO v_categories
  FROM expense_totals;

  WITH bucket_specs AS (
    SELECT
      n,
      CASE p_period_type
        WHEN 'week' THEN v_start_date + n
        WHEN 'month' THEN greatest(date_trunc('week', v_start_date::timestamp)::date + (n * 7), v_start_date)
        ELSE (v_start_date::timestamp + make_interval(months => n))::date
      END AS bucket_start,
      CASE p_period_type
        WHEN 'week' THEN v_start_date + n + 1
        WHEN 'month' THEN least(date_trunc('week', v_start_date::timestamp)::date + (n * 7) + 7, v_end_date)
        ELSE ((v_start_date::timestamp + make_interval(months => n + 1))::date)
      END AS bucket_end
    FROM generate_series(0, CASE p_period_type WHEN 'week' THEN 6 WHEN 'month' THEN 5 ELSE 11 END) AS g(n)
    WHERE CASE p_period_type
      WHEN 'week' THEN v_start_date + n < v_end_date
      WHEN 'month' THEN date_trunc('week', v_start_date::timestamp)::date + (n * 7) < v_end_date
      ELSE n < 12
    END
  ), sales_by_bucket AS (
    SELECT
      CASE p_period_type
        WHEN 'week' THEN (s.created_at AT TIME ZONE 'America/Santo_Domingo')::date
        WHEN 'month' THEN greatest(date_trunc('week', s.created_at AT TIME ZONE 'America/Santo_Domingo')::date, v_start_date)
        ELSE date_trunc('month', s.created_at AT TIME ZONE 'America/Santo_Domingo')::date
      END AS bucket_start,
      sum(s.subtotal) AS amount
    FROM public.sales AS s
    WHERE s.voided_at IS NULL AND s.created_at >= v_start_at AND s.created_at < v_end_at
    GROUP BY 1
  ), expenses_by_bucket AS (
    SELECT
      CASE p_period_type
        WHEN 'week' THEN e.date
        WHEN 'month' THEN greatest(date_trunc('week', e.date::timestamp)::date, v_start_date)
        ELSE date_trunc('month', e.date::timestamp)::date
      END AS bucket_start,
      sum(e.amount) AS amount
    FROM public.expenses AS e
    WHERE e.status = 'registrado' AND e.voided_at IS NULL
      AND e.date >= v_start_date AND e.date < v_end_date
    GROUP BY 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'startDate', b.bucket_start::text,
    'label', CASE p_period_type
      WHEN 'week' THEN CASE extract(isodow FROM b.bucket_start)
        WHEN 1 THEN 'Lun' WHEN 2 THEN 'Mar' WHEN 3 THEN 'Mié' WHEN 4 THEN 'Jue'
        WHEN 5 THEN 'Vie' WHEN 6 THEN 'Sáb' ELSE 'Dom' END
      WHEN 'month' THEN 'Semana ' || (b.n + 1)::text
      ELSE CASE extract(month FROM b.bucket_start)
        WHEN 1 THEN 'Ene' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar' WHEN 4 THEN 'Abr'
        WHEN 5 THEN 'May' WHEN 6 THEN 'Jun' WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago'
        WHEN 9 THEN 'Sep' WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' ELSE 'Dic' END
    END,
    'salesSubtotal', coalesce(s.amount, 0.00::numeric)::text,
    'operatingExpenses', coalesce(e.amount, 0.00::numeric)::text
  ) ORDER BY b.bucket_start), '[]'::jsonb)
  INTO v_buckets
  FROM bucket_specs AS b
  LEFT JOIN sales_by_bucket AS s ON s.bucket_start = b.bucket_start
  LEFT JOIN expenses_by_bucket AS e ON e.bucket_start = b.bucket_start;

  v_generated_at := to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  RETURN jsonb_build_object(
    'period', jsonb_build_object(
      'type', p_period_type,
      'anchorDate', v_anchor,
      'startDate', v_start_date::text,
      'endDateExclusive', v_end_date::text
    ),
    'generatedAt', v_generated_at,
    'hasMovements', (v_sale_count + v_expense_count + v_purchase_count) > 0,
    'metrics', jsonb_build_object(
      'salesSubtotal', v_sales_subtotal::text,
      'operatingExpenses', v_operating_expenses::text,
      'merchandisePurchases', v_merchandise_purchases::text,
      'salesTax', v_sales_tax::text
    ),
    'buckets', v_buckets,
    'expenseCategories', v_categories
  );
END
$function$;

REVOKE ALL ON FUNCTION public.get_business_report(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_report(text, date) TO authenticated;

COMMENT ON FUNCTION public.get_business_report(text, date) IS
  'Read-only administrative aggregate for business reports. Uses SECURITY INVOKER and existing RLS policies; amounts are returned as decimal text.';

COMMIT;
