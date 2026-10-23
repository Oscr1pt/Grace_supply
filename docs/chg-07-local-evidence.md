# CHG-07: evidencia y límites locales

## Frontera de escritura

`post_sale`, `post_purchase`, `post_credit_payment` y `adjust_inventory` son funciones PostgreSQL `SECURITY DEFINER` con `search_path` fijo. Cada función deriva el actor de `auth.uid()`, valida permiso CHG-05 incluso al reproducir una clave, reserva `(actor, tipo, clave)` y persiste el resultado junto con los documentos y los cambios de inventario/saldos en una sola transacción. Un hash SHA-256 del JSONB canónico excluye solo la clave; el mismo contenido devuelve el resultado guardado y otro contenido con la misma clave produce conflicto. `get_business_operation` limita la reconciliación al actor y permiso actuales.

El frontend invoca un RPC financiero por intención. No tiene `service_role`, no calcula saldos autorizados y no ejecuta DML alternativo si un RPC falla. Los hooks de refresco solo vuelven a leer datos luego de una respuesta canónica del RPC. Un error de transporte se reconcilia por tipo y clave; si no se puede confirmar, la interfaz conserva el estado incierto y bloquea otro envío.

## Evidencia ejecutada en Supabase local

Comando: `npm run test:business:local`. El script valida que la URL sea loopback, instala y siempre retira un trigger sintético que hace fallar la inserción del crédito de proveedor. Los fixtures usan empleados, contrapartes y productos temporales con prefijo CHG-07 y los eliminan al terminar.

Casos integrados actuales: compra/reposición/crédito y repetición idempotente; misma clave con contenido distinto; denegación al empleado sin permiso de compra; fallos inyectados en crédito de proveedor, línea de venta, actualización de saldo y ajuste, con rollback comprobado de documentos, pagos, stock y registro idempotente; venta a crédito y replay; pagos de clientes y proveedores con replay; rechazo de sobrepago; rechazo de cotización obsoleta y cotización ausente; revocación antes de devolver un resultado anterior; concurrencia de dos ventas sobre la última unidad; bloqueo sin efectos mientras la política tributaria está pendiente; ajuste autorizado, replay, conflicto de cantidad y denegación por permiso.

Los datos de impuestos del test son una política sintética local de tasa cero, restaurada al terminar. No equivalen a aprobación comercial ni fiscal. La función rechaza ventas con modalidad/tasa no aprobada, tasa no cero o impuestos incluidos porque no hay una regla de cálculo autorizada. Esa es una decisión bloqueante para activar ventas reales.

## Decisiones financieras pendientes

- Tasa y modalidad tributaria aplicables, si los precios incluyen impuesto, y regla exacta de redondeo por línea/subtotal/impuesto.
- Retención/aprobación de la política durable de claves (90 días sigue siendo solo una propuesta); no hay purga automática.
- Autorización final del precio vigente con confirmación ante conflicto, y otras reglas de vencimiento comercial que el Change dejó como propuestas.

No se inventan reglas: hasta aprobar la configuración fiscal, la ruta de venta no contabiliza y no muestra éxito. Compras y pagos no dependen de esa regla.

## Aún no demostrado

- Desconexiones y timeouts reales antes y después del commit, incluida reconciliación navegador→RPC tras respuesta perdida; el replay de una clave confirma idempotencia, pero no simula un corte real de transporte.
- Concurrencia de pagos distintos, compra simultánea con venta del mismo artículo y la misma clave enviada concurrentemente desde dos sesiones.
- Pruebas de navegador end-to-end sobre reconciliación, caché, cierre de formularios y recibo/impresión con respuestas inciertas.
- No se ejecutó migración o prueba en Supabase Cloud.

## Evidencia de tarea 3.1 — concurrencia, transporte y navegador

Ejecutada únicamente contra Supabase local con identidades, clientes, proveedores y artículos sintéticos. `npm run test:business:local` pasó 14/14 casos (incluye los 10 escenarios previos; no se sustituyeron por mocks ni pruebas secuenciales). Las comprobaciones finales clave consultaron directamente el contenedor PostgreSQL con `psql`, además de lecturas por la API local:

- Dos sesiones Auth independientes intentaron pagar 70 y 40 sobre una deuda de 100. Solo una escritura fue aceptada; PostgreSQL conservó un pago y `paid + balance = total`, sin sobrepago.
- Compra de 2 unidades y venta de 2 del mismo artículo corrieron simultáneamente desde sesiones con permisos distintos. Ambas quedaron confirmadas; la existencia final fue 2, con un encabezado de compra y sus dos unidades de línea de venta persistidos.
- Dos sesiones independientes del mismo actor enviaron simultáneamente la misma compra con la misma clave UUID. Ambas recibieron el mismo resultado; PostgreSQL contiene un documento y una fila `business_operations`. El replay igual devolvió ese resultado y cambiar la cantidad con la clave retenida fue rechazado sin alterar existencias.
- Interrupción antes del commit: se abortó una petición HTTP real mientras un trigger PostgreSQL sintético demoraba el insert. Se consultaron el documento y la reserva idempotente en PostgreSQL: no hubo estado parcial; se reconcilió la operación si el servidor alcanzó a confirmar, y el reintento con la UUID produjo exactamente un documento.
- Interrupción después del commit: un proxy local descartó la respuesta HTTP únicamente después de recibir el resultado 2xx del RPC. La lectura SQL local encontró un documento y una clave con resultado durable; `get_business_operation` y el replay recuperaron el mismo resultado sin duplicar.
- Las verificaciones de stock/documentos usan `inventory`, `purchases` y `sale_lines`; el esquema vigente no tiene una tabla separada de movimientos de inventario. No se afirma la existencia de un ledger de movimientos independiente.

`playwright test --config=playwright.config.mjs` pasó 8/8 casos en navegador Chromium local. Los casos financieros verificaron un rechazo SQL que deja formulario/cache intactos y no reenvía, y una respuesta perdida post-commit que solo confirma/cierra el formulario tras reconciliar por UUID. Los seis casos CHG-01 preexistentes también pasaron: error SQL, desconexión previa, denegación 403, lectura posterior autorizada tras timeout, reconciliación no disponible y respuesta de lectura fuera de orden. Se reemplazó el inicio mediante username real contra la Edge Function local; no se usó una clave privilegiada en el navegador.

La interrupción pre-commit puede terminar en rollback o en commit si el servidor continúa pese al cierre del cliente; en ambos casos el test consulta el resultado final y exige estado completo, reconciliación por UUID y ausencia de duplicación. No se presupone que cerrar el socket cancele el trabajo del servidor.

Estos resultados verifican consistencia de las operaciones probadas; no aprueban impuestos, redondeo, inclusión de impuestos ni retención de idempotencia. La política tributaria de venta sigue bloqueada hasta aprobación comercial.

CHG-08 sigue siendo responsable de anulaciones, compensaciones financieras y auditoría avanzada. CHG-07 no afirma atomicidad entre Supabase Auth y PostgreSQL ni crea una transacción ficticia de varias llamadas HTTP.
