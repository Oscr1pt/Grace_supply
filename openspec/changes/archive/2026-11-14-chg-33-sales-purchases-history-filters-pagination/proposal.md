# Proposal

## Why

Los historiales de Ventas y Compras no permiten buscar ni acotar registros por fecha y las páginas cargan la colección sin paginación propia. Con el crecimiento, localizar una operación es lento y la respuesta limitada por PostgREST puede dejar registros antiguos fuera de la interfaz.

## What Changes

- Añadir búsqueda de ventas por número de recibo y nombre visible del cliente, y de compras por número de factura o UUID y nombre histórico del proveedor.
- Añadir filtros Todos, Hoy, Últimos 7 días, Este mes y Personalizado, interpretados en `America/Santo_Domingo` sobre `created_at`.
- Consultar resultados en PostgreSQL con páginas de 25 registros, orden estable por fecha e identificador descendentes, y conteo exacto de coincidencias.
- Añadir controles responsive para limpiar filtros y navegar Anterior/Siguiente, y estados distintos de carga, error, historial vacío y cero coincidencias.
- Conservar consultas de recibos, anulaciones, permisos, RLS y contratos financieros sin cambios.

## Capabilities

### New Capabilities

<!-- None: this extends the existing sales and purchases UI capability. -->

### Modified Capabilities

- `safe-sales-purchases-ui`: definir búsqueda, filtros de período, límites de fecha, orden y paginación de los historiales.

## Impact

- UI: `src/routes/_app/sales.tsx`, `src/routes/_app/purchases.tsx`.
- Lectura: lectores específicos de historial, sin cambiar globalmente `useSupabaseTable`.
- Una migración forward-only con funciones RPC de solo lectura es necesaria para combinar búsqueda por identificador y contraparte antes de ordenar, contar y paginar correctamente en servidor; los filtros PostgREST actuales no ofrecen un OR seguro entre esas tablas relacionadas.
- Las funciones conservan RLS, exigen permisos existentes, usan `SECURITY INVOKER` y se exponen solo a `authenticated`; no cambian grants de tablas ni políticas.
- No se agregan índices sin evidencia de los planes de consulta.
- Pruebas: búsqueda, períodos y límites, paginación, permisos, estados, responsive y regresión financiera.