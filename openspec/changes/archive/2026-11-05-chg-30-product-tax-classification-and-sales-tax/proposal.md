# Proposal

## Why

El selector de clasificación tributaria ya existe en Inventario, pero Cloud no concede al rol `authenticated` una vía autorizada para persistir `tax_classification`. Como resultado, administradores no pueden clasificar productos y las ventas muestran un error genérico cuando un producto permanece pendiente.

## What Changes

- Añadir una operación PostgreSQL administrativa y auditable para crear/editar la clasificación `gravado`, `exento` o `pendiente`, manteniendo `pendiente` como valor seguro por defecto.
- Impedir que usuarios sin permiso `inventory` o administradores inactivos modifiquen `tax_classification` mediante REST, sin conceder acceso general a `inventory` ni desproteger `quantity`, precios u otros campos protegidos.
- Incluir la clasificación confirmada en las consultas de ventas y corregir la previsualización y los mensajes para ITBIS desactivado, gravado, exento y pendiente.
- Distinguir `financial_tax_policy_pending` de `tax_classification_pending` en el mapeo de errores de operaciones financieras.
- Registrar actor, fecha, producto y valores anterior/nuevo de cada cambio de clasificación mediante el mecanismo de auditoría existente.
- Crear una migración forward-only y pruebas unitarias, PostgreSQL/Auth-RLS, concurrencia e interfaz sin modificar migraciones históricas, Cloud ni Changes archivados.

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- `approved-sales-tax-policy`: las ventas deben consumir la clasificación confirmada por producto, aplicar 18% solo a `gravado`, cero a `exento`, bloquear `pendiente` cuando ITBIS esté activo y mostrar errores diferenciados.
- `product-inventory-workflows`: la clasificación tributaria del producto se administra mediante una operación autorizada y auditable, conservando las restricciones de inventario y el borrador ante errores.
- `inventory-operator-experience`: el formulario de Inventario debe permitir clasificar productos con permisos efectivos, estados y mensajes recuperables.

## Impact

- `src/routes/_app/inventory.tsx` y consultas/helpers de catálogo y ventas.
- `src/lib/businessOperations.ts`, `src/lib/salesTaxPolicy.js` y tipos relacionados.
- PostgreSQL: una migración incremental para la operación de clasificación, auditoría y permisos mínimos.
- Pruebas unitarias, de integración financiera/Auth-RLS y Playwright.
- No se modifican Cloud, migraciones históricas, datos comerciales existentes ni Changes archivados.
