# CHG-24 — Ajustes manuales de inventario autorizados y auditables

## Why

La pantalla de inventario muestra «Existencia (Stock)» deshabilitada y solo permite actualizar cantidades mediante compras y ventas. El usuario necesita poder corregir manualmente una existencia real (conteo físico, deterioro, pérdida, diferencia de recepción o corrección documentada), sin convertir la edición de productos en una actualización directa y no auditada de `quantity`.

La aplicación ya dispone de `public.adjust_inventory(p_request jsonb)` y `postBusinessOperation('inventory_adjustment', ...)`. La RPC comprueba permiso `inventory`, delta no nulo, motivo, existencia suficiente, coincidencia de `expected_quantity`, bloquea la fila y usa idempotencia. El trigger protege `inventory.quantity` frente a escrituras ordinarias. Sin embargo, no existe una UI para invocarla.

La RPC actualmente devuelve `operation_id`, producto, cantidad anterior, cantidad resultante y delta, **pero no incluye `reason` en el resultado**. La auditoría CHG-08 toma el motivo de ese resultado; por tanto, la evidencia de razón en `financial_audit_events.details.reason` no queda garantizada para ajustes. CHG-24 debe cerrar esta brecha.

## What Changes

- Incorporar desde la pantalla de inventario un flujo «Ajustar existencia» independiente del formulario de metadatos. Presentar cantidad actual confirmada, cantidad objetivo o variación firmada, vista previa de delta, motivo obligatorio y confirmación explícita.
- Ejecutar exclusivamente la operación autorizada `adjust_inventory` mediante `postBusinessOperation`, con `item_id`, `expected_quantity`, `delta`, `reason` y una clave de idempotencia estable por intención. Nunca escribir `inventory.quantity` con INSERT/PATCH desde la UI.
- Asegurar mediante migración versionada mínima que el motivo validado forme parte del resultado persistido y del evento de auditoría existente. Exponer, solo a actores autorizados, evidencia comprensible de ajustes (quién/cuándo/producto/antes/después/delta/motivo), sin ampliar la lectura privada de toda la auditoría a empleados.
- Añadir pruebas de permiso, falta de stock, colisión concurrente, doble clic/reintento/timeout, trazabilidad del motivo, errores de conexión y consistencia del inventario.

## Capabilities
### New Capabilities
- `authorized-inventory-adjustments`: corrección manual de existencias a través de una operación del servidor, con resultado y auditoría confiables.

## Impact

`src/routes/_app/inventory.tsx`, helpers acotados de validación/estado si hacen falta, `src/lib/businessOperations.ts` (reutilización, no sustitución), nueva migración de auditoría/resultado si resulta necesaria, pruebas de inventario/RPC/Auth/RLS/Playwright y spec canónica de CHG-24.

## Non-goals

- No implementar transferencias, conteo cíclico completo, multi-almacén ni kardex contable nuevo.
- No cambiar la política tributaria o desbloquear ventas.
- No permitir cambios directos de `quantity`, controles SQL solo de frontend o nuevas facultades para `anon`/`PUBLIC`.
- No reescribir asientos financieros, compras, ventas, créditos o evidencias CHG-08.
- No crear un permiso nuevo si el permiso `inventory` existente es suficiente; las vistas de auditoría mantienen sus autorizaciones vigentes.

## Acceptance

Tres tareas como máximo. Un usuario con permiso activo `inventory` puede aumentar o reducir existencias con justificación, el servidor rechaza stock negativo, datos inválidos o valor base obsoleto, y la operación confirmada produce una sola modificación y evidencia persistida. Una persona sin permiso no puede ajustar por UI ni API. Ante respuesta incierta no se duplica el ajuste. Tests y validación OpenSpec estrictos antes de archivo/publicación.
