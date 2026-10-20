# Tasks

Planificación: las tres tareas del roadmap permanecen pendientes. Requiere CHG-07 y los gates de CHG-00.

## 1. Evidencia inmutable y actor

- [ ] 1.1 Diseñar e implementar eventos financieros de solo adición, restringidos y atómicos con actor auth.uid() y tiempo servidor, incluyendo procedencia honesta del legado; verificar por operación actor/tiempo adulterados, permisos de lectura/escritura y rollback al fallar el evento, documentando campos permitidos y límites históricos.

## 2. Anulación y compensaciones

- [ ] 2.1 Sustituir eliminación/edición destructiva de documentos financieros por anulación y reversión de pagos autorizadas con motivo e idempotencia CHG-07; verificar por contrato conservación de nominales/snapshots, extensión compatible de principal vigente y compensaciones positivas, rechazo de pagos vigentes o stock insuficiente, y documentar conciliación externa sin simular devoluciones.

## 3. Conciliación y preservación integrada

- [ ] 3.1 Probar en staging actor/permisos, DELETE rechazado, anulación concurrente/repetida, historia sin actor verificable y efectos de stock no demostrables; verificar stock/paid/principal/saldo netos, informes sin doble conteo e historia preservada con eventos correlacionados, incluyendo recuperación que no borre evidencia.

