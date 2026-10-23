-- CHG-03 integration assertions. All business fixtures are rolled back.
DO $$
DECLARE
  rejected boolean;
  stored_price numeric(14,2);
BEGIN
  IF (SELECT count(*) FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        AND c.relname <> 'schema_migrations') <> 12 THEN
    RAISE EXCEPTION 'expected the 12-table versioned domain schema';
  END IF;
  IF (SELECT count(*) FROM public.settings) <> 1
     OR (SELECT currency FROM public.settings LIMIT 1) <> 'DOP'
     OR (SELECT id FROM public.settings LIMIT 1) <> '00000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'settings singleton contract is not satisfied';
  END IF;
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'id') <> 'uuid'
     OR (SELECT numeric_precision FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'total') <> 14
     OR (SELECT numeric_scale FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'total') <> 2 THEN
    RAISE EXCEPTION 'SQL UUID or NUMERIC(14,2) contract drifted';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND c.relname <> 'schema_migrations'
      AND (NOT c.relrowsecurity
        OR has_table_privilege('anon', c.oid, 'SELECT')
        OR has_table_privilege('anon', c.oid, 'INSERT')
        OR has_table_privilege('authenticated', c.oid, 'SELECT')
        OR has_table_privilege('authenticated', c.oid, 'INSERT'))
  ) THEN
    RAISE EXCEPTION 'client role has access or RLS is disabled';
  END IF;

  -- Positive relational contract and snapshot behavior, all reverted below.
  BEGIN
    INSERT INTO public.clients (id, name) VALUES
      ('00000000-0000-0000-0000-000000000101', 'chg03 synthetic client');
    INSERT INTO public.suppliers (id, name) VALUES
      ('00000000-0000-0000-0000-000000000102', 'chg03 synthetic supplier');
    INSERT INTO public.inventory (id, sku, kind, name, category, cost_price, price, quantity)
      VALUES ('00000000-0000-0000-0000-000000000103', 'CHG03-SYNTHETIC', 'joya', 'synthetic item', 'otro', 10, 20, 1);
    INSERT INTO public.sales (id, receipt_no, client_id, subtotal, tax_rate, tax, total)
      VALUES ('00000000-0000-0000-0000-000000000104', 'CHG03-SYNTHETIC',
        '00000000-0000-0000-0000-000000000101', 20, 0, 0, 20);
    INSERT INTO public.sale_lines (id, sale_id, item_id, sku, name, unit_price, quantity)
      VALUES ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000104',
        '00000000-0000-0000-0000-000000000103', 'CHG03-SYNTHETIC', 'synthetic item', 20, 1);
    INSERT INTO public.client_credits
      (id, sale_id, client_id, receipt_no, total, paid, balance)
      VALUES ('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000104',
        '00000000-0000-0000-0000-000000000101', 'CHG03-SYNTHETIC', 20, 0, 20);
    INSERT INTO public.purchases
      (id, supplier, supplier_id, quantity, unit_cost, total)
      VALUES ('00000000-0000-0000-0000-000000000107', 'chg03 synthetic supplier',
        '00000000-0000-0000-0000-000000000102', 1, 10, 10);
    INSERT INTO public.supplier_credits
      (id, purchase_id, supplier_id, supplier_name, invoice_no, total, paid, balance)
      VALUES ('00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0000-000000000107',
        '00000000-0000-0000-0000-000000000102', 'chg03 synthetic supplier', 'CHG03-SYNTHETIC', 10, 0, 10);
    INSERT INTO public.credit_payments (client_credit_id, amount)
      VALUES ('00000000-0000-0000-0000-000000000106', 5);
    INSERT INTO public.credit_payments (supplier_credit_id, amount)
      VALUES ('00000000-0000-0000-0000-000000000108', 5);
    UPDATE public.inventory SET price = 25 WHERE id = '00000000-0000-0000-0000-000000000103';
    SELECT unit_price INTO stored_price FROM public.sale_lines
      WHERE id = '00000000-0000-0000-0000-000000000105';
    IF stored_price <> 20 THEN
      RAISE EXCEPTION 'sale price snapshot changed with catalog price';
    END IF;

    rejected := false;
    BEGIN
      INSERT INTO public.inventory (sku, kind, name, category, quantity)
        VALUES ('CHG03-BAD-STOCK', 'joya', 'bad stock', 'otro', -1);
    EXCEPTION WHEN check_violation THEN rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'negative stock was accepted'; END IF;

    rejected := false;
    BEGIN
      INSERT INTO public.expenses
        (concept, category, amount, payment_method, beneficiary, registered_by)
        VALUES ('CHG03 negative amount', 'otros', -1, 'efectivo', 'synthetic', 'synthetic');
    EXCEPTION WHEN check_violation THEN rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'negative monetary amount was accepted'; END IF;

    rejected := false;
    BEGIN
      INSERT INTO public.credit_payments (client_credit_id, supplier_credit_id, amount)
        VALUES ('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000108', 1);
    EXCEPTION WHEN check_violation THEN rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'ambiguous payment reference was accepted'; END IF;

    rejected := false;
    BEGIN
      INSERT INTO public.credit_payments (client_credit_id, amount)
        VALUES ('00000000-0000-0000-0000-000000000199', 1);
    EXCEPTION WHEN foreign_key_violation THEN rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'orphan payment reference was accepted'; END IF;

    rejected := false;
    BEGIN
      INSERT INTO public.sales (receipt_no, client_id, subtotal, tax, total)
        VALUES ('CHG03-NONFINITE', '00000000-0000-0000-0000-000000000101', 'Infinity', 0, 'Infinity');
    EXCEPTION WHEN check_violation OR numeric_value_out_of_range THEN rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'non-finite monetary amount was accepted'; END IF;

    rejected := false;
    BEGIN
      INSERT INTO public.sales (receipt_no, client_id, subtotal, tax, total)
        VALUES ('CHG03-ORPHAN', '00000000-0000-0000-0000-000000000199', 1, 0, 1);
    EXCEPTION WHEN foreign_key_violation THEN rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'orphan sale was accepted'; END IF;

    rejected := false;
    BEGIN
      INSERT INTO public.sales (receipt_no, client_id, subtotal, tax, total)
        VALUES ('CHG03-SYNTHETIC', '00000000-0000-0000-0000-000000000101', 20, 0, 20);
    EXCEPTION WHEN unique_violation THEN rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'duplicate receipt number was accepted'; END IF;

    RAISE SQLSTATE 'PZ001';
  EXCEPTION WHEN SQLSTATE 'PZ001' THEN
    NULL; -- intentional rollback of every synthetic row above
  END;

  IF EXISTS (SELECT 1 FROM public.clients WHERE id = '00000000-0000-0000-0000-000000000101')
     OR EXISTS (SELECT 1 FROM public.inventory WHERE sku LIKE 'CHG03-%')
     OR EXISTS (SELECT 1 FROM public.sales WHERE receipt_no LIKE 'CHG03-%')
     OR EXISTS (SELECT 1 FROM public.purchases WHERE id = '00000000-0000-0000-0000-000000000107') THEN
    RAISE EXCEPTION 'synthetic CHG-03 fixtures were not cleaned up';
  END IF;
END
$$;
