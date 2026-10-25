# Tasks

Planificación: las tres tareas del roadmap permanecen pendientes. Requiere CHG-07. No importar ni fabricar historial a partir de las filas de prueba existentes; validar hechos nuevos con datos sintéticos.

## 1. Evidencia inmutable y actor

- [x] 1.1 Diseñar e implementar eventos financieros de solo adición, restringidos y atómicos con actor auth.uid() y tiempo servidor para operaciones nuevas; verificar por operación actor/tiempo adulterados, permisos de lectura/escritura y rollback al fallar el evento. No importar ni atribuir historia a filas de prueba.

## 2. Anulación y compensaciones

- [x] 2.1 Sustituir eliminación/edición destructiva de documentos financieros por anulación y reversión de pagos autorizadas con motivo e idempotencia CHG-07; verificar por contrato conservación de nominales/snapshots, extensión compatible de principal vigente y compensaciones positivas, rechazo de pagos vigentes o stock insuficiente, y documentar conciliación externa sin simular devoluciones.

## 3. Conciliación y preservación integrada

- [x] 3.1 Probar en Supabase local/aislado actor/permisos, DELETE rechazado, anulación concurrente/repetida y compensaciones con datos sintéticos; verificar stock/paid/principal/saldo netos e informes sin doble conteo, sin migrar historia ficticia.

