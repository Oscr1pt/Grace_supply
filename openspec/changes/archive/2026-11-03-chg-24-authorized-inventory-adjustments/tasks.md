# Tasks — CHG-24-AUTHORIZED-INVENTORY-ADJUSTMENTS

> Change activo **0/3 tareas**. Base esperada `feature/frontend-improvements`, CHG-23 archivado y publicado en `64bf837e8934a4b0a1a1a160a6d48baff5ae8734`. Recuperar artefactos desde rama `docs/chg-24-authorized-inventory-adjustments`, validar OpenSpec estricto y ejecutar Apply sin merge. No commit/push/merge/archive durante implementación.

## 1. Interfaz de corrección de existencias
- [x] **1.1** Agregar acción «Ajustar existencia» para productos con permiso `inventory`, modal accesible con cantidad base confirmada, cantidad objetivo, delta calculado, motivo obligatorio (1–500), confirmación y estados reales. Invocar `postBusinessOperation('inventory_adjustment', ...)` con UUID de idempotencia estable, `item_id`, `expected_quantity`, `delta`, `reason`; bloquear dobles envíos, reconciliar respuestas inciertas y actualizar stock solo desde respuesta/lectura server. Permitir stock inicial tras creación mediante RPC, no inserción directa. **Verificar:** formularios, permisos, reintentos y errores de concurrencia.

## 2. Auditoría de motivo y garantías de servidor
- [x] **2.1** Revisar `adjust_inventory` y la auditoría CHG-08; mediante migración nueva, incluir motivo validado en resultado persistido/evento de auditoría y límites de entrada apropiados, sin cambiar firma ni eliminar lock, guardias, autorización, idempotencia o RLS. Mantener denegación REST directa a `inventory.quantity`. Si se ofrece historial visible, respetar RLS existente de `financial_audit_events`. **Verificar:** razón, actor, antes/después, delta, fecha, una operación/un evento y ningún registro ante rechazo.

## 3. Pruebas de operación y regresión
- [x] **3.1** Validar con fixture sintético en Supabase local desechable: unidad/delta/motivo inválidos, stock negativo, coincidencia de cantidad base, concurrencia, repetición de clave/payload, respuesta perdida y reconciliación, roles/revocación/anon, PATCH stock denegado, auditoría y UI (teclado/móvil). Ejecutar pruebas unitarias, integración Auth/RLS, Playwright focalizado, `npm test`, TS, ESLint afectado, build, OpenSpec estricto y `git diff --check`. **Verificar:** cero movimientos duplicados, RLS intacta, evidencia real y ninguna escritura a Cloud.

> No usar el formulario de producto para parchear quantity. Preservar archivos locales ajenos y Changes archivados; no comenzar CHG-25.
