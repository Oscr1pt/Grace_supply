# CHG-13 — Experiencia de inventario y selección de productos

## Why
La UI del inventario usa opciones `joya/piedra` y nombres de columnas de gemas. Etiquetas y formularios comerciales arrastran ese contrato. Grace Supply necesita formularios de productos reales creados por el cliente y una selección coherente al facturar.

## What Changes
- Rediseñar formulario, filtros, tabla y detalle de inventario en torno al contrato neutro de CHG-12.
- Alinear etiquetas y códigos de barras con nombre, SKU, variante y precio de suministros.
- Integrar catálogo con compras, ventas y facturación interna, respetando los RPC financieros y el bloqueo tributario.

## Capabilities
### New Capabilities
- `product-inventory-workflows`: experiencia configurable de inventario y selección segura en documentos.

## Impact
`src/routes/_app/inventory.tsx`, `src/components/BarcodeLabel.tsx`, `src/routes/_app/sales.tsx`, `src/routes/_app/purchases.tsx` y pruebas de navegador.

## Boundaries
No crear productos demo en Cloud ni aplicar impuestos ficticios. No habilitar eliminación destructiva de productos con movimientos. No introducir compras/ventas que eludan las funciones transaccionales.

## Acceptance
Catálogo vacío usable; productos nuevos aparecen en selectores y facturas; etiquetas no muestran terminología de gemas; seguridad, accesibilidad y operación financiera mantienen pruebas.
