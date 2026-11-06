# Tasks

## 1. Clasificación autorizada y auditoría

- [x] 1.1 Crear la migración forward-only y la operación PostgreSQL de clasificación tributaria, con autorización de administrador activo, `search_path` fijo, validación de `gravado`/`exento`/`pendiente`, bloqueo de fila, auditoría de actor/fecha/valores y grants mínimos; integrar creación y edición de Inventario conservando `Pendiente`, stock, precios y el borrador ante fallos, y verificar con pruebas unitarias y Auth/RLS directas y concurrentes.

## 2. Cálculo y experiencia de venta

- [x] 2.1 Actualizar consultas, tipos, previsualización y manejo de errores para consumir la clasificación confirmada: 18% solo para `gravado` con ITBIS activo, cero para `exento` o ITBIS desactivado, bloqueo explícito de `pendiente`, redondeo coincidente con PostgreSQL y distinción entre `financial_tax_policy_pending` y `tax_classification_pending`; verificar con pruebas financieras y de interfaz de ventas.

## 3. Integración y seguridad

- [x] 3.1 Ejecutar en Supabase local desechable las pruebas de clasificación, REST/RLS, auditoría, concurrencia, inventario, idempotencia, ventas mixtas y recibos; ejecutar Playwright focalizado, `npm test`, TypeScript, ESLint, build, `git diff --check` y validación OpenSpec estricta, sin modificar Cloud ni Changes archivados.
