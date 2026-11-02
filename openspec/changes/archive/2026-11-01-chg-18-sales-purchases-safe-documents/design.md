# Design — CHG-18-SALES-PURCHASES-SAFE-DOCUMENTS: Ventas, compras y documentos sin ambigüedad

## Evidencia observada en main
Ventas y compras funcionan mediante RPC auditadas, pero la interfaz permite abrir flujos que pueden acabar bloqueados por la política fiscal, usa `window.prompt` para motivos de anulación y tiene formularios densos donde la selección de producto/proveedor y el stock deben ser inequívocos.

## Archivos y áreas de trabajo
- `src/routes/_app/sales.tsx`
- `src/routes/_app/purchases.tsx`
- `src/lib/businessOperations.ts`
- `src/components/ui/alert-dialog.tsx`
- `tests/browser/**`

## Diseño propuesto
- Guiar composición de ventas y compras, validaciones y totales, sin cambiar las operaciones transaccionales.
- Explicar bloqueos tributarios, diferencias entre contado/crédito y disponibilidad de productos.
- Mejorar recibos, anulación con motivo y mensajes de conciliación sin fingir éxito ni duplicar solicitudes.

## Restricciones y decisiones
- No implementar política tributaria ni habilitar ventas por configuración visual; reglas fiscales requieren aprobación separada.
- No reimplementar totales como fuente de verdad; los valores confirmados proceden del RPC.
- Preservar el original, anulaciones, compensación y auditoría; no permitir DELETE financiero directo.
- Recibos imprimibles deben usar snapshots históricos confirmados, no recalcular contra productos actuales.

## Estrategia de verificación
- Validación del comportamiento autorizado y persistencia real; fallos de API, carga, cero filas y cambios de sesión.
- Captura visual comparativa escritorio/tablet/móvil y revisión de accesibilidad por teclado; no introducir una nueva identidad visual.
- Ejecutar pruebas aplicables del módulo, `npm test`, TypeScript, build y `openspec validate chg-18-sales-purchases-safe-documents --strict` tras implementar.
- Las listas exhaustivas de QA manual (happy/sad/edge) corresponden a la fase 2, una vez completados estos Changes.
