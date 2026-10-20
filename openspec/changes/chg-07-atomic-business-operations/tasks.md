# Tasks

Planificación: tres tareas del roadmap, pendientes; se implementarán después de CHG-01/06 y el corte CHG-04/05.

## 1. Contratos y autorización

- [ ] 1.1 Diseñar e implementar los contratos server/RPC de venta, compra, creación ligada de crédito, pago y ajuste de inventario con la matriz CHG-05; verificar entradas/salidas/errores, actor vigente y permisos por tipo mediante pruebas de cada contrato y documentar la frontera transaccional.

## 2. Atomicidad, cálculo e idempotencia

- [ ] 2.1 Implementar transacciones, cálculo decimal servidor, locks ordenados y registro durable de idempotencia del diseño, adaptando rutas a una llamada por intención; verificar por operación rollback ante fallo inyectado, cotización en conflicto y misma clave con contenido igual/distinto, documentando reconciliación sin DML alternativo.

## 3. Concurrencia y recuperación integrada

- [ ] 3.1 Ejecutar en staging con conexiones concurrentes última unidad, compra/venta simultánea, pagos sobre saldo, reintentos y desconexiones antes/después del commit; verificar sin parciales, sobreventa, actualización perdida ni pago duplicado y conciliar stock/paid/balance con documentos y claves persistidos.

