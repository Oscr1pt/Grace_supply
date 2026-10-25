INSERT INTO public.clients (id, name) VALUES
  ('12000000-0000-4000-8000-000000000001', 'CHG-12 synthetic client');

-- These synthetic baseline rows model pre-existing stock. The disposable
-- database owner bypasses only the normal user-operation guard while loading
-- the fixture; the migration and application tests keep the guard enabled.
ALTER TABLE public.inventory DISABLE TRIGGER inventory_protected_fields_guard;
INSERT INTO public.inventory (
  id, sku, kind, name, category, metal, karat, weight_grams, stone,
  stone_carats, stone_cut, stone_clarity, stone_color, size_mm, size_label,
  cost_price, price, quantity
) VALUES (
  '12000000-0000-4000-8000-000000000002', 'CHG12-LEGACY-01', 'joya',
  'Synthetic legacy item', 'otro', 'Marca anterior', '250 ml', 1.250,
  'Especificación anterior', 0.200, 'corte anterior', 'claridad anterior',
  'color anterior', 12.500, 'tamaño anterior', 5.25, 8.50, 9
);
ALTER TABLE public.inventory ENABLE TRIGGER inventory_protected_fields_guard;

INSERT INTO public.purchases (
  id, supplier, item_id, description, quantity, unit_cost, total, payment_type
) VALUES (
  '12000000-0000-4000-8000-000000000003', 'Proveedor sintético',
  '12000000-0000-4000-8000-000000000002', 'Compra sintética enlazada', 2, 4.00, 8.00, 'contado'
);

INSERT INTO public.sales (
  id, receipt_no, client_id, subtotal, tax_rate, tax, total, payment_type
) VALUES (
  '12000000-0000-4000-8000-000000000004', 'CHG12-SYNTHETIC-01',
  '12000000-0000-4000-8000-000000000001', 25.50, 0, 0, 25.50, 'contado'
);

INSERT INTO public.sale_lines (id, sale_id, item_id, sku, name, unit_price, quantity) VALUES (
  '12000000-0000-4000-8000-000000000005',
  '12000000-0000-4000-8000-000000000004',
  '12000000-0000-4000-8000-000000000002',
  'CHG12-LEGACY-01', 'Historical line snapshot', 8.50, 3
);
