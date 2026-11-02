# CHG-18-SALES-PURCHASES-SAFE-DOCUMENTS — Ventas, compras y documentos sin ambigüedad

## Why
Ventas y compras funcionan mediante RPC auditadas, pero la interfaz permite abrir flujos que pueden acabar bloqueados por la política fiscal, usa `window.prompt` para motivos de anulación y tiene formularios densos donde la selección de producto/proveedor y el stock deben ser inequívocos.

## What Changes
- Guiar composición de ventas y compras, validaciones y totales, sin cambiar las operaciones transaccionales.
- Explicar bloqueos tributarios, diferencias entre contado/crédito y disponibilidad de productos.
- Mejorar recibos, anulación con motivo y mensajes de conciliación sin fingir éxito ni duplicar solicitudes.

## Capabilities
### New Capabilities
- `safe-sales-purchases-ui`: experiencia funcional y visual revisada de Grace Supply.

## Impact
- `src/routes/_app/sales.tsx`
- `src/routes/_app/purchases.tsx`
- `src/lib/businessOperations.ts`
- `src/components/ui/alert-dialog.tsx`
- `tests/browser/**`

## Boundaries
- No implementar política tributaria ni habilitar ventas por configuración visual; reglas fiscales requieren aprobación separada.
- No reimplementar totales como fuente de verdad; los valores confirmados proceden del RPC.
- Preservar el original, anulaciones, compensación y auditoría; no permitir DELETE financiero directo.
- Recibos imprimibles deben usar snapshots históricos confirmados, no recalcular contra productos actuales.

## Acceptance
Tres tareas verificables; mejoras acotadas, sin alterar contratos financieros/Auth existentes, con regresión funcional, accesibilidad, build y OpenSpec estricto.
