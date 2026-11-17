# Proposal — Compras con múltiples líneas de productos

## Why

`purchases` y `post_purchase` representan actualmente una compra con un solo `item_id`, cantidad y costo unitario. El negocio necesita registrar varios productos en un único documento sin dividir el total, la cuenta por pagar, la identidad idempotente ni la anulación en operaciones financieras separadas.

## What Changes

- Permitir varias líneas de producto con cantidad, costo unitario y subtotal, agregar/eliminar líneas y mostrar total de servidor.
- Mantener una compra, un proveedor, una factura, un tipo de pago y, para crédito, una sola cuenta por pagar por el total.
- Añadir almacenamiento normalizado de líneas con snapshots al contabilizar; conservar intactas las compras históricas y su formato legado.
- Actualizar `post_purchase` para validar, calcular, bloquear y reponer todas las líneas atómicamente, manteniendo compatibilidad con solicitudes antiguas de una sola línea y compras sin artículo vinculado.
- Actualizar la anulación financiera para compensar cada línea repuesta y rechazar toda la anulación si falta stock de cualquier producto.
- Extender el historial CHG-33 para buscar y mostrar encabezados de compra con líneas múltiples, y permitir consultar detalles bajo las políticas existentes.

### Extensión antes del cierre: productos no registrados

- Permitir múltiples líneas manuales y compras mixtas junto a las líneas vinculadas al inventario.
- Guardar cada línea manual con `item_id = NULL`, nombre/descripción histórica obligatoria y sin snapshot SKU ni reposición de inventario.
- Mantener las líneas vinculadas sujetas a FK, snapshots de inventario y rechazo de duplicados; no crear productos automáticamente.
- Conservar una sola compra, total calculado en PostgreSQL, crédito, idempotencia, conciliación, anulaciones, historial y permisos.
- Implementar el cambio mediante una migración incremental; la migración CHG-35 ya publicada permanece inmutable.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `atomic-business-posting`: compras multilínea con total, crédito, reposición e idempotencia en una sola transacción autorizada.
- `financial-evidence-preservation`: anulación compensatoria de todas las líneas repuestas, sin reversión parcial ni stock negativo.
- `safe-sales-purchases-ui`: composición y consulta de líneas, conservación de documentos sencillos e históricos.

## Impact

- PostgreSQL: migración forward-only con `purchase_lines`, compatibilidad de columnas legadas y reemplazo coordinado de `post_purchase`, `annul_financial_document` y `search_purchases_history`.
- Lectura de detalles de líneas con permisos compatibles con compras existentes; sin ampliación de acceso, RLS o políticas financieras.
- UI/tipos: `src/routes/_app/purchases.tsx`, validación de documentos, operaciones de negocio, consultas de historial, tipos de base de datos y de dominio.
- Integración/Auth-RLS, unit tests y Playwright; pruebas de respuesta incierta, concurrencia, stock, crédito e historial.
- Depende de los contratos ya publicados de CHG-07, CHG-08 y CHG-33. Es independiente de CHG-34, aunque ambas propuestas afectan capacidades de ventas/compras comunes.
