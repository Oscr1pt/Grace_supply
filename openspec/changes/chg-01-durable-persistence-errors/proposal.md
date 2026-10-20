# Proposal — Persistencia confirmada y errores visibles

## Why

`src/lib/storage.ts` ignora errores de respuestas Supabase y modifica estado/caché como si la escritura hubiera persistido; ajustes y equipo anuncian éxito sin esperar. Se necesita un contrato uniforme que impida confirmaciones fantasma.

## What Changes

- Definir resultado confirmado por operación, tratamiento de errores y comprobación de filas afectadas.
- Adaptar hooks y consumidores de ajustes, ventas, compras, créditos, gastos y empleados para esperar confirmación y conservar formularios ante error.
- Verificar RLS denegada, cero filas, fallo SQL, desconexión y resultado incierto sin convertir almacenamiento local en persistencia remota.

## Capabilities

### New Capabilities

- `verified-persistence`: persistencia confirmada y errores visibles.

### Modified Capabilities

Ninguna; el inventario inicial de especificaciones principales está vacío.

## Impact

`src/lib/storage.ts`, `src/lib/settings.ts`, `src/lib/auth.tsx`, `src/routes/_app/*.tsx` y `src/components/BarcodeLabel.tsx`; contratos de escritura de Supabase.

### Objetivo, evidencia y trazabilidad

Findings 7, según el roadmap. Estado: propuesta de planificación; ninguna medida está implementada ni verificada en el despliegue por esta ejecución. Fuente principal: `docs/database-remediation-roadmap.md`; no se encontró el informe original de auditoría, por lo que la numeración de Findings procede exclusivamente del roadmap.
La evidencia local detallada y sus límites se registran en `design.md`.

### Alcance y exclusiones

Este Change cubre únicamente la capacidad declarada. Quedan fuera DGII/e-CF, rediseño UI, actualizaciones de dependencias (CHG-02), limpieza general de caché entre usuarios (CHG-09) y QA integral de Phase 3. Esta entrega solo crea planificación OpenSpec; no modifica código, SQL ejecutable, datos, usuarios ni políticas remotas.

### Dependencias y límites entre Changes

Requiere CHG-00. CHG-07 será dueño de atomicidad y reintentos idempotentes de operaciones compuestas; CHG-04 cambiará el transporte de administración de empleados.

### Criterios de aceptación

Éxito visible solo tras confirmación verificable; un error o cero filas no cierra formulario ni imprime recibo ni altera el estado confirmado. Los escenarios de `specs/verified-persistence/spec.md` especifican las comprobaciones de la futura implementación; validar estos documentos no equivale a superar esas pruebas.

### Riesgos y recuperación

Mayor visibilidad de errores y pérdida de la ilusión de trabajo offline; recuperación a versión que respete el mismo contrato o suspensión de escrituras. El detalle del procedimiento está en `design.md`.

### Decisiones antes de implementar

Aprobar que las escrituras offline no se anuncien como guardadas y la política de reconciliación de resultados inciertos. Toda intervención en el despliegue requiere autorización humana y respaldo/restauración aprobados conforme a CHG-00.

### Estado de validación de planificación

Validación individual aprobada con OpenSpec 1.14.3: `openspec validate chg-01-durable-persistence-errors --strict --no-interactive`. Cuatro artefactos completos y exactamente tres tareas pendientes, sin subtareas. La validación comprueba los documentos, no la eficacia de las futuras remediaciones en Supabase. Revisión final del conjunto: 2026-10-20.

