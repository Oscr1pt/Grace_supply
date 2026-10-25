# CHG-12 — Catálogo configurable de productos

## Why
El inventario aún modela joyería (`joya/piedra`, `metal/karat/stone*` y categorías `anillo/collar/...`), aunque la UI disfraza algunos códigos con etiquetas de barbería. El cliente debe crear productos reales sin catálogo precargado ni categorías rígidas.

## What Changes
- Definir atributos comerciales neutros y categorías configurables para insumos de barbería, cosmética, herramientas y otros artículos.
- Evolucionar el contrato de PostgreSQL/TypeScript con migración aditiva y transformación explícita de datos existentes.
- Mantener SKU, IDs, precios DOP, stock, permisos RLS y relaciones de ventas/compras.

## Capabilities
### New Capabilities
- `configurable-product-catalog`: artículos administrados por usuarios autorizados con nombre, descripción, categoría y precio.

## Impact
`inventory`, migración nueva, `src/lib/types.ts`, contratos de Supabase y controles de integridad. Dependencia CHG-11; CHG-13 adapta interfaces de usuario.

## Boundaries
No añadir fixtures reales, no eliminar registros de Cloud, no reescribir las 15 migraciones aplicadas. Evitar categorías obligatorias cerradas. Nunca permitir edición directa de stock que eluda RPC o auditoría.

## Acceptance
Alta, edición y consulta autorizadas en PostgreSQL local; datos legados de prueba conservados o gestionados con mecanismo reversible y explícito; importes, stock y operaciones financieras sin regresión.
