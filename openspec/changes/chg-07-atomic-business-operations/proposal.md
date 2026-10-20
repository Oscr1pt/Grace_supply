# Proposal — Operaciones de negocio atómicas e idempotentes

## Why

Ventas, compras y abonos realizan varias escrituras independientes con stock/saldos calculados en navegador. Aunque cada escritura confirme, persisten riesgos de estados parciales, concurrencia y duplicación.

## What Changes

- **BREAKING**: sustituir secuencias del cliente por contratos de operación transaccional de servidor/RPC con identidad y permiso verificados.
- Calcular importes en servidor, bloquear filas compartidas, exigir stock/saldos válidos y registrar claves de idempotencia durables.
- Verificar última unidad concurrente, pagos simultáneos, reintentos tras timeout y fallos parciales.

## Capabilities

### New Capabilities

- `atomic-business-posting`: operaciones de negocio atómicas e idempotentes.

### Modified Capabilities

Ninguna; el inventario inicial de especificaciones principales está vacío.

## Impact

`src/routes/_app/{sales,purchases,clients,suppliers,inventory}.tsx`, contratos de persistencia CHG-01 y futuras funciones/registro de operaciones en PostgreSQL.

### Objetivo, evidencia y trazabilidad

Findings 5, 6, según el roadmap. Estado: propuesta de planificación; ninguna medida está implementada ni verificada en el despliegue por esta ejecución. Fuente principal: `docs/database-remediation-roadmap.md`; no se encontró el informe original de auditoría, por lo que la numeración de Findings procede exclusivamente del roadmap.
La evidencia local detallada y sus límites se registran en `design.md`.

### Alcance y exclusiones

Este Change cubre únicamente la capacidad declarada. Quedan fuera DGII/e-CF, rediseño UI, actualizaciones de dependencias (CHG-02), limpieza general de caché entre usuarios (CHG-09) y QA integral de Phase 3. Esta entrega solo crea planificación OpenSpec; no modifica código, SQL ejecutable, datos, usuarios ni políticas remotas.

### Dependencias y límites entre Changes

Requiere CHG-06 y corte CHG-04/05, además del contrato CHG-01. CHG-08 añadirá evidencia auditable y anulación sobre estas mismas transacciones.

### Criterios de aceptación

Una operación confirma todos sus efectos o ninguno; stock nunca negativo; misma clave no duplica venta/pago y crédito permanece conciliado. Los escenarios de `specs/atomic-business-posting/spec.md` especifican las comprobaciones de la futura implementación; validar estos documentos no equivale a superar esas pruebas.

### Riesgos y recuperación

Deadlocks, respuestas perdidas y cambios de precio; recuperar mediante consulta por clave o corrección hacia adelante, sin volver a escrituras múltiples. El detalle del procedimiento está en `design.md`.

### Decisiones antes de implementar

Aprobar política de precios y redondeo, ausencia de sobrepagos y conservación de claves de idempotencia vinculadas al historial. Toda intervención en el despliegue requiere autorización humana y respaldo/restauración aprobados conforme a CHG-00.

### Estado de validación de planificación

Validación individual aprobada con OpenSpec 1.14.3: `openspec validate chg-07-atomic-business-operations --strict --no-interactive`. Cuatro artefactos completos y exactamente tres tareas pendientes, sin subtareas. La validación comprueba los documentos, no la eficacia de las futuras remediaciones en Supabase. Revisión final del conjunto: 2026-10-20.

