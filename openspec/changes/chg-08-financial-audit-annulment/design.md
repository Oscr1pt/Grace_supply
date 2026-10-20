# Design

## Context

Ver `proposal.md` (Finding 10). Ventas/compras llaman remove y DELETE del hook; borrar venta advierte que no restaura inventario. Gastos usan status anulado pero registeredBy/updatedAt salen del navegador y los importes de un gasto vigente pueden editarse. No hay esquema local de auditoría, pero esto no demuestra ausencia remota. CHG-03 debe contrastar el esquema real; no se inventan eventos pasados.

## Goals / Non-Goals

**Goals:** evidencia de solo adición, autoría verificada y anulación/compensación atómica de ventas/compras/créditos/pagos/gastos con stock/saldos conciliados.

**Non-Goals:** integrar bancos, devolución automática de dinero, facturación fiscal, prometer protección contra superusuarios de PostgreSQL o reconstruir autoría histórica desconocida.

## Decisions

### Evidencia dentro de la misma transacción

Futuro almacén restringido de eventos con event_id, operation_id de CHG-07, tipo/ID de entidad, acción, actor_auth_id obtenido de auth.uid(), recorded_at de servidor, motivo acotado y campos financieros anteriores/posteriores aprobados. Registrar creación, cambios operativos de créditos, abonos, ajustes de stock ligados y anulaciones; extender funciones CHG-07 y mutaciones permitidas de gastos con triggers/funciones que no puedan omitir evento. Si falla el evento, aborta la operación completa. Idempotencia evita repetir tanto efectos como eventos; establecer unicidad de evento por operación/entidad/acción cuando corresponda.

Solo un rol técnico interno puede insertar a través de la operación/trigger. Roles de aplicación, incluido admin, carecen de INSERT/UPDATE/DELETE directo sobre eventos; admin activo tiene consulta autorizada según CHG-05, empleados/anon/revocados ninguna. Helpers definer siguen propietario mínimo, rutas cualificadas y ejecución limitada de CHG-05. No permitir actor arbitrario ni bypass de auditoría desde una función privilegiada. La restricción no promete impedir manipulación por dueño/superusuario de DB: accesos operacionales se controlan y documentan aparte.

Lista blanca de snapshots: IDs, número interno, importes, cantidades, estado y referencias de compensación. Evitar copiar perfiles completos, contactos, secretos o payload bruto. Motivos no contienen contraseñas ni datos privados innecesarios; tamaño limitado y acceso restringido. Alternativas descartadas: log solo de frontend, log asíncrono después del commit o snapshot indiscriminado de todas las tablas.

### Originales, resumen vigente y compensaciones

Conservar importe/número/líneas originales de documentos y pagos. No permitir DELETE financiero ni editar importes contabilizados; corrección financiera se hace por anular/reemitir con enlace, sin reciclar números. Cambios no financieros permitidos de gasto vigente requieren evento antes/después; anulado es no editable.

Agregar registros tipados de anulación/reversión con FK al documento original, motivo, actor/tiempo de servidor y operation_id, UNIQUE del original para la anulación efectiva. Montos de movimientos positivos con dirección explícita, no insertar pagos negativos ni stock negativo para revertir. Estado del documento puede cambiar a anulado pero snapshots originales permanecen. Crédito original conserva total nominal y los pagos originales no se eliminan; su resumen vigente se calcula desde movimientos válidos y compensaciones.

Extensión explícita del modelo CHG-06: principal_cancelled inicia en cero y solo la operación de anulación lo lleva al nominal cuando no hay abonos vigentes. Principal vigente = total nominal - principal_cancelled; paid es suma neta de pagos no revertidos; balance = principal vigente - paid. CHECK mantiene total nominal > 0, 0 <= principal_cancelled <= total, 0 <= paid <= principal vigente y balance >= 0 con igualdad exacta. Estado anulado solo si principal_cancelled = total, paid = 0 y balance = 0; los demás estados siguen CHG-06. Así no se modifica total histórico ni se relajan dominios para registrar una reversión. La versión CHG-08 amplía los checks/estados y deja intacta la ecuación de principal vigente de la spec CHG-06.

### Contratos de anulación y reglas de conciliación

Usar operaciones RPC de una transacción con admin activo, motivo obligatorio, clave y cotización/versión esperada; mismo orden de locks de CHG-07 y comprobación de estado vigente antes de actuar. No se agrega otro mecanismo de idempotencia.

| Caso | Efectos y condición |
| --- | --- |
| Venta al contado | marcar anulado, movimiento inverso de stock por cantidades originales, evidencia y referencia; conciliación de devolución fuera del sistema documentada si aplica |
| Venta a crédito sin pagos vigentes | además cancelar principal y dejar paid/balance netos en cero conservando crédito nominal |
| Compra con reposición | retirar exactamente unidades repuestas; rechazar toda anulación si stock disponible insuficiente; revertir cuenta por pagar solo sin pagos vigentes |
| Compra descriptiva sin reposición | no alterar stock; conservar proveedor/snapshot y efecto financiero trazable |
| Pago/abono | reverse_payment conserva pago original, agrega reversión única y recalcula paid/balance del crédito bajo lock; no vuelve a descontar stock |
| Crédito | no se borra ni anula libremente: cancelación ligada al documento que lo originó |
| Gasto | mantener original, marcar anulado, compensar importe contable con movimiento tipado y motivo; nunca DELETE |

Propuesta conservadora: no anular venta/compra con pagos vigentes. Primero reverse_payment autorizada, con motivo y referencia de conciliación externa si hubo movimiento real de dinero; no fingir que el sistema devolvió fondos. No agregar reembolsos externos, devoluciones parciales o neteos libres a este alcance. En documentos al contado, la anulación registra corrección interna y requiere referencia a conciliación de fondos cuando corresponda; no confirma devolución bancaria.

Operaciones CHG-07 comprobarán que el documento/crédito no está anulado antes de contabilizar nuevos pagos. Para compensar inventario se usan los deltas efectivos persistidos por CHG-07, no se infiere reposición solo de item_id. Si el legado no permite demostrar qué stock se movió, la anulación automática queda bloqueada hasta obtener evidencia y resolución aprobada; no inventar un delta histórico. Las consultas/historial/dashboards usan nominal, compensación y neto explícitos, mostrando original y vínculo; un simple filtro que oculte anulados no es conservación de evidencia.

### Historia previa y fuente verificable

Preservar registros heredados sin inventar actor ni momento original. Registrar un snapshot con source legacy_snapshot, fecha de incorporación y operador/migración separados del actor original desconocido. El nombre registered_by heredado es dato reportado no verificado, no auth.uid() histórico. Para el evento actual de incorporación conservar identidad verificada del operador cuando la ruta de ejecución la provea; importación operacional usa referencia restringida del operador, sin simular JWT ni adjudicarle creación original. Documentos ya perdidos no se reconstruyen sin fuente comprobable.

## Risks / Trade-offs

- [Compra a revertir ya consumida] → rechazar sin efectos y requerir resolución operacional específica, no stock negativo.
- [Documento pagado] → bloquear anulación hasta reversión trazable y conciliación; ninguna devolución automática.
- [Auditoría filtra datos] → lista blanca, motivo acotado y SELECT restringido.
- [Actor histórico no comprobable] → procedencia y limitación explícitas, sin autoría inventada.
- [Rollback elimina evidencia nueva] → conservar eventos/compensaciones y corregir hacia adelante; nunca volver a DELETE.
- [Netos inconsistentes tras cambio de checks] → migración con principal_cancelled = 0, comparación exacta de saldos y pruebas de CHG-06/07.

## Migration Plan

Requiere CHG-07 y sus dependencias; versionar con CHG-03 y recuperación CHG-00. En futura implementación: crear almacén/eventos y permisos mínimos; establecer snapshot/procedencia de legado sin falso historial; agregar compensaciones/campos/checks con defaults compatibles; extender operaciones y consultas del cliente. Cerrar DELETE y DML alternativo definitivamente; reemplazar botones destructivos y edición financiera por acciones autorizadas con motivo, sin rediseño UI general.

Pruebas con sintéticos: evento por creación y cambio, actor/tiempo adulterados rechazados, fallo de evento revierte negocio, admin no altera audit log, employee/anon/revocado no lo leen, DELETE financiero rechazado, anulación repetida/concurrente, compra sin stock, pago revertido, documento con pagos vigentes y saldo/principal netos conciliados. Comparar documentos/números/snapshots originales, stock antes/después y sumas de movimientos, y revisar historial/dashboards. No certificar integridad histórica anterior sin fuente.

Salida: todos los efectos nuevos tienen evidencia transaccional y no hay ruta silenciosa de pérdida. Rollback: cerrar operaciones afectadas y conservar esquema/eventos; desplegar una versión compatible que mantenga restricciones o corregir hacia adelante. Si se requiere restauración catastrófica, aislar y reconciliar eventos/operaciones posteriores bajo CHG-00 antes de habilitar tráfico; nunca borrar eventos para encubrir fallos ni retornar a eliminación destructiva.

## Decisiones que requieren aprobación

Anulación/lectura de auditoría solo admin, retención/custodia sin purga automática, lista blanca de datos, reglas de fondos externos y prohibición de anular documentos con pagos vigentes. El diseño es una propuesta para revisión; ninguna anulación, evento o migración fue ejecutada.

