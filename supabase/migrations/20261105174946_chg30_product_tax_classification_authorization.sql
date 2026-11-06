-- CHG-30: authorize product tax classification without exposing general inventory updates.
BEGIN;

CREATE TABLE IF NOT EXISTS public.inventory_tax_classification_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  previous_classification text NOT NULL CHECK (previous_classification IN ('gravado', 'exento', 'pendiente')),
  new_classification text NOT NULL CHECK (new_classification IN ('gravado', 'exento', 'pendiente')),
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_tax_classification_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_tax_classification_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.inventory_tax_classification_audit TO authenticated;

DROP POLICY IF EXISTS inventory_tax_classification_audit_read ON public.inventory_tax_classification_audit;
CREATE POLICY inventory_tax_classification_audit_read
  ON public.inventory_tax_classification_audit
  FOR SELECT TO authenticated
  USING (private.is_active_admin() AND private.has_permission('inventory'));

CREATE OR REPLACE FUNCTION public.set_product_tax_classification(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE
  v_actor uuid := private.require_business_permission('inventory');
  v_item public.inventory%ROWTYPE;
  v_item_id uuid := nullif(p_request->>'item_id', '')::uuid;
  v_classification text := lower(nullif(btrim(p_request->>'tax_classification'), ''));
  v_previous text;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'business_operation_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF v_item_id IS NULL OR v_classification IS NULL
     OR v_classification NOT IN ('gravado', 'exento', 'pendiente') THEN
    RAISE EXCEPTION 'invalid_tax_classification' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO STRICT v_item
  FROM public.inventory
  WHERE id = v_item_id
  FOR UPDATE;
  v_previous := coalesce(v_item.tax_classification, 'pendiente');

  IF v_previous <> v_classification THEN
    UPDATE public.inventory
    SET tax_classification = v_classification
    WHERE id = v_item_id;

    INSERT INTO public.inventory_tax_classification_audit (
      inventory_id, actor_id, previous_classification, new_classification
    ) VALUES (
      v_item_id, v_actor, v_previous, v_classification
    );
  END IF;

  RETURN jsonb_build_object(
    'item_id', v_item_id,
    'tax_classification', v_classification,
    'previous_tax_classification', v_previous,
    'changed', v_previous <> v_classification
  );
END
$function$;

REVOKE ALL ON FUNCTION public.set_product_tax_classification(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_tax_classification(jsonb) TO authenticated;

CREATE OR REPLACE VIEW public.sales_inventory_lookup WITH (security_barrier = true) AS
  SELECT id, sku, name, price, quantity, tax_classification
  FROM public.inventory
  WHERE (private.has_permission('sales') OR private.has_permission('purchases'))
    AND is_active;

CREATE OR REPLACE VIEW public.admin_inventory_catalog WITH (security_barrier = true) AS
  SELECT id, sku, kind, name, category, metal, karat, weight_grams, stone,
    stone_carats, stone_cut, stone_clarity, stone_color, size_mm, size_label,
    cost_price, price, quantity, created_at,
    description, brand, presentation, unit, attributes, is_active,
    tax_classification
  FROM public.inventory
  WHERE private.is_active_admin();

GRANT SELECT ON public.sales_inventory_lookup, public.admin_inventory_catalog TO authenticated;

CREATE VIEW public.sales_tax_preview_status WITH (security_barrier = true) AS
  SELECT
    s.tax_calculation_enabled,
    s.tax_rate,
    s.tax_policy_status
  FROM public.settings AS s
  WHERE s.id = '00000000-0000-0000-0000-000000000001'
    AND private.has_permission('sales');

GRANT SELECT ON public.sales_tax_preview_status TO authenticated;

COMMIT;
