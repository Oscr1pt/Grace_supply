# Design — CHG-24: Flujo seguro de ajustes de existencia

## Evidencia en código (revisión de la rama feature/frontend-improvements)

1. `src/routes/_app/inventory.tsx`: campo «Existencia (Stock)» está `disabled`; al editar se elimina `quantity` del objeto antes del `updateItem`. La tabla muestra el valor y las acciones de editar/estado/etiqueta, pero no ajustar.
2. `src/lib/businessOperations.ts`: `postBusinessOperation('inventory_adjustment', request)` mapea a `adjust_inventory` y exige `operation_id`; `getConfirmedBusinessOperation` reconcilia por actor/tipo/idempotency key. La capa distingue rechazo definitivo de resultado incierto.
3. Migración `20261022220000_chg07_atomic_business_operations.sql`: `adjust_inventory` requiere `private.require_business_permission('inventory')`, `delta` entero no cero, motivo no vacío, bloqueo `FOR UPDATE`, `expected_quantity` opcional, stock no negativo, evento de operación único y guardia de stock.
4. CHG-08 `private.audit_business_operation()` guarda eventos inmutables cuando se persiste `business_operations.result`. Intenta extraer `reason` de ese resultado, aunque `adjust_inventory` todavía no lo devuelve. `financial_audit_events` tiene lectura administrativa limitada por RLS.
5. Specs vigentes `product-inventory-workflows`, `inventory-operator-experience` y `atomic-business-posting` exigen control de stock mediante operaciones autorizadas, consistencia bajo concurrencia, idempotencia y ausencia de éxitos ficticios.

## D1 — UI y experiencia (tarea 1.1)

- Agregar en cada producto acción «Ajustar existencia», visible/activada solo cuando la sesión tiene permiso `inventory` efectivo. Reutilizar la protección de ruta pero confiar **siempre** en la RPC para autorización definitiva. Evitar mezclar el formulario de precio/metadatos con un PATCH de stock.
- Modal accesible con producto/SKU, existencia leída del servidor (mostrar cuándo fue confirmada), campo de **nueva existencia deseada** en unidades enteras >=0, variación calculada, motivo obligatorio y vista previa «antes → después». Alternativa permitida: entrada de delta firmado más cantidad final; no mantener dos entradas contradictorias. Aceptar ajustes positivos y negativos, rechazar delta cero, cantidades fraccionarias/no finitas e importes fuera de rango. Motivo entre 1 y 500 caracteres tras trim, sin secretos/datos personales, con mensajes y foco de error.
- Antes de confirmar, actualizar la cantidad base si está obsoleta; enviar `expected_quantity` con el valor mostrado y `delta = objetivo - base`. En colisión `40001`, mostrar valor refrescado, conservar el motivo y exigir **nueva confirmación** con nueva intención, sin aplicar un delta calculado contra stock viejo.
- Bloquear doble clic, mostrar estado «procesando / pendiente de conciliación / confirmado / rechazado», conservar clave original mientras el resultado sea incierto, permitir consulta/reintento seguro por actor/tipo/clave (nunca crear otra clave automáticamente ante timeout). Solo refrescar e informar éxito cuando el servidor confirme operación e inventario actual.
- Para registrar stock inicial de un producto, mantener INSERT de catálogo con `quantity=0` y ofrecer el ajuste posterior mediante esta misma RPC. No inducir a registrar una compra falsa o usar el editor general de producto para cargar stock.

## D2 — Resultado auditable y servidor (tarea 2.1)

- Reutilizar `adjust_inventory` sin crear un canal alternativo. Confirmar que devuelve de forma persistida el `reason` validado junto con `operation_id`, `item_id`, `previous_quantity`, `quantity` y `delta`; el trigger de CHG-08 debe registrar dicho motivo en `financial_audit_events.details` para el mismo `operation_id`. Aplicar el cambio mediante **nueva migración forward-only** que preserve la firma, permisos, búsqueda de funciones, definer, guardia, idempotencia, autorización, lock y las demás invariantes.
- Validar `reason` no vacío y acotado (1–500 caracteres), valor entero seguro de `delta`, objetivo no negativo, y stock base si se proporciona. Nunca confiar en el actor o stock final enviado por el navegador. Preservar `FOR UPDATE` y ausencia de stock negativo.
- El ledger `business_operations.request` y la auditoría llevan motivo; no duplicar datos sensibles innecesariamente ni incluir secretos. Para el listado histórico, si se ofrece UI, usar únicamente relaciones/autorizaciones existentes; la vista completa de `financial_audit_events` continúa limitada a administradores. Un operador puede ver la confirmación de su operación, sin obtener historial privado de otros.
- Revisar los casos de `get_business_operation`: la recuperación valida identidad, permiso `inventory` y clave del mismo actor, y no permite enumeración. Respuestas repetidas con misma clave + payload no reaplican el movimiento; clave igual con payload distinto provoca conflicto.
- Conservar escritura directa de stock denegada por REST/PATCH incluso al usuario con permiso `inventory`. No crear GRANT de actualización de `quantity`, no bajar RLS, no modificar autorizaciones de terceros. No tocar ventas y compras ni sus resultados fiscales.

## D3 — Verificación (tarea 3.1)

- Solo stack Supabase **local desechable comprobado**. Confirmar nombre/host/contenedor/migraciones antes de cualquier escritura; excluir por defecto el stack habitual y Cloud. Crear datos sintéticos identificados; limpiar exclusivamente los del test.
- Unitarias: objetivo entero, delta no cero, motivo vacío/excesivo, tamaño inválido, serialización y estados de respuesta incierta. Integración API Auth/RLS: rol admin, empleado con permiso `inventory`, empleado sin permiso, anónimo, revocado, PATCH directo rechazado, stock cero y negativo rechazado, versión obsoleta `40001`, transacciones concurrentes y reintentos con clave igual/distinta.
- Auditoría DB: inspeccionar que una única operación confirmada tiene antes/después/delta/motivo exactos, actor y marca temporal; resultado repetido no genera segundo evento; no existe evento si el ajuste se rechaza. Verificar que no se exponen eventos de otros actores a usuarios sin permisos de auditoría.
- Playwright: abrir desde fila de inventario, accesibilidad teclado/foco/errores, aumentar/reducir, discrepancia concurrente, doble clic, error red/timeout con reconciliación, recarga de tabla/lector; comprobar 320/375/768/1280.
- Ejecutar `npm test`, suites focalizadas de Auth/RLS/DB/Playwright, TypeScript, ESLint afectado, build, `git diff --check` y `openspec validate chg-24-authorized-inventory-adjustments --strict`. Informar skips por separado; nunca marcar 3/3 si falla evidencia crítica.

## Riesgos y límites

Si los eventos históricos de ajuste carecen de motivo en `financial_audit_events.details`, no inventar ni rellenar datos retrospectivamente. El resultado histórico de operaciones previas no se altera. Si se detecta que la RPC no puede garantizar el contrato sin un cambio amplio, reportar bloqueo y proponer una migración mínima verificable, no editar migraciones anteriores.

Mantener intactos archivos protegidos, otros Changes y datos ajenos, y no hacer commit/push/merge/archive en Apply.
