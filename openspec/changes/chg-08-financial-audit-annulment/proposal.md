# Proposal — Auditoría financiera y anulación controlada

## Why

Ventas y compras se eliminan físicamente desde sus rutas; gastos conservan estado anulado, pero actor y tiempo se envían desde navegador. Hace falta trazabilidad inmutable y compensaciones conciliadas para todos los documentos financieros.

## What Changes

- Registrar eventos restringidos con actor `auth.uid()`, tiempo de servidor, motivo y correlación transaccional.
- **BREAKING**: reemplazar DELETE y edición destructiva de documentos por anulación/compensación autorizada e idempotente.
- Verificar actor, permisos, conservación de historia y conciliación de stock, créditos, pagos y gastos.

## Capabilities

### New Capabilities

- `financial-evidence-preservation`: auditoría financiera y anulación controlada.

### Modified Capabilities

Ninguna; el inventario inicial de especificaciones principales está vacío.

## Impact

Ventas, compras, créditos, pagos, gastos, rutas relacionadas, funciones CHG-07 y futuro almacén de auditoría; dashboards conservarán distinción entre vigentes y anulados.

### Objetivo, evidencia y trazabilidad

Findings 10, según el roadmap. Estado: propuesta de planificación; ninguna medida está implementada ni verificada en el despliegue por esta ejecución. Fuente principal: `docs/database-remediation-roadmap.md`; no se encontró el informe original de auditoría, por lo que la numeración de Findings procede exclusivamente del roadmap.
La evidencia local detallada y sus límites se registran en `design.md`.

### Alcance y exclusiones

Este Change cubre únicamente la capacidad declarada. Quedan fuera DGII/e-CF, rediseño UI, actualizaciones de dependencias (CHG-02), limpieza general de caché entre usuarios (CHG-09) y QA integral de Phase 3. Esta entrega solo crea planificación OpenSpec; no modifica código, SQL ejecutable, datos, usuarios ni políticas remotas.

### Dependencias y límites entre Changes

Requiere CHG-07 y sus dependencias CHG-06 y CHG-04/05. CHG-05 define patrón de grants/RLS; CHG-08 aplica ese patrón al almacén auditable.

### Criterios de aceptación

Cada efecto financiero tiene evento atómico verificable; no hay DELETE silencioso ni doble compensación; historia y saldos se conservan. Los escenarios de `specs/financial-evidence-preservation/spec.md` especifican las comprobaciones de la futura implementación; validar estos documentos no equivale a superar esas pruebas.

### Riesgos y recuperación

Compensación de compras sin stock suficiente y documentos ya pagados; rechazar anulación incompatible y recuperar con asientos adicionales trazables. El detalle del procedimiento está en `design.md`.

### Decisiones antes de implementar

Aprobar permisos de anulación/consulta, retención de auditoría y reglas de compensación para documentos con pagos previos. Toda intervención en el despliegue requiere autorización humana y respaldo/restauración aprobados conforme a CHG-00.

### Estado de validación de planificación

Validación individual aprobada con OpenSpec 1.14.3: `openspec validate chg-08-financial-audit-annulment --strict --no-interactive`. Cuatro artefactos completos y exactamente tres tareas pendientes, sin subtareas. La validación comprueba los documentos, no la eficacia de las futuras remediaciones en Supabase. Revisión final del conjunto: 2026-10-20.

