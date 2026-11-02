BEGIN;

-- Expose only the sales flow's current posting gate to authenticated sales users.
-- PostgreSQL remains the authority for posting in public.post_sale.
CREATE VIEW public.sales_posting_status WITH (security_barrier = true) AS
  SELECT
    s.tax_policy_approved,
    coalesce(
      s.tax_policy_approved
        AND s.tax_prices_include = false
        AND s.tax_rounding_policy IS NOT NULL
        AND s.tax_rate = 0,
      false
    ) AS sales_posting_supported
  FROM public.settings AS s
  WHERE s.id = '00000000-0000-0000-0000-000000000001'
    AND private.has_permission('sales');

GRANT SELECT ON public.sales_posting_status TO authenticated;

COMMIT;
