# Proposal

## Why

El formulario de productos siempre comienza con existencia cero, obligando a registrar después un ajuste separado. Esto dificulta la carga inicial y puede inducir escrituras directas de `inventory.quantity` si no se ofrece un flujo seguro.

## What Changes

- Añadir al formulario de nuevo producto una existencia inicial entera no negativa, con valor predeterminado cero.
- Crear primero el producto con existencia cero y registrar una existencia inicial positiva mediante `postBusinessOperation("inventory_adjustment", ...)`.
- Usar motivo auditable, clave idempotente estable y reconciliación ante respuestas inciertas.
- Mantener separado el ajuste de productos existentes y rechazar escrituras directas de stock.
- Añadir pruebas de validación, permisos, concurrencia, auditoría y recuperación.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `configurable-product-catalog`: el alta de producto acepta existencia inicial validada sin escribir stock directamente.
- `authorized-inventory-adjustments`: la existencia inicial reutiliza la misma operación autorizada, auditoría e idempotencia.

## Impact

Afecta `inventory.tsx`, validadores, helpers de operaciones pendientes, pruebas y posiblemente una migración solo si la auditoría necesita distinguir el motivo. No modifica compras, ventas, créditos, RLS ni migraciones históricas.
