# Proposal — Contención y recuperación verificable

## Why

El roadmap registra exposición anónima y de contraseñas previamente confirmada que debe tratarse como urgente hasta verificar su contención. Se necesita una barrera operativa segura y recuperación ensayada antes de cualquier remediación.

## What Changes

- Verificar exposición por metadatos y sondas sin datos privados; definir contención urgente que pueda interrumpir el cliente heredado.
- Establecer staging sintético, respaldo protegido, ensayo de restauración y plan de rotación según el material realmente expuesto.
- Definir propietarios, ventana, aprobación humana y criterios medibles de avance o recuperación.

## Capabilities

### New Capabilities

- `database-access-containment`: contención y recuperación verificable.

### Modified Capabilities

Ninguna; el inventario inicial de especificaciones principales está vacío.

## Impact

Configuración del proyecto Supabase, superficie REST/RPC, respaldos, despliegue y runbooks; referencias locales: `src/lib/auth.tsx`, `supabase_migration.sql` y `supabase_migration_expenses.sql`.

### Objetivo, evidencia y trazabilidad

Findings 1, 2, 3, según el roadmap. Estado: propuesta de planificación; ninguna medida está implementada ni verificada en el despliegue por esta ejecución. Fuente principal: `docs/database-remediation-roadmap.md`; no se encontró el informe original de auditoría, por lo que la numeración de Findings procede exclusivamente del roadmap.
La evidencia local detallada y sus límites se registran en `design.md`.

### Alcance y exclusiones

Este Change cubre únicamente la capacidad declarada. Quedan fuera DGII/e-CF, rediseño UI, actualizaciones de dependencias (CHG-02), limpieza general de caché entre usuarios (CHG-09) y QA integral de Phase 3. Esta entrega solo crea planificación OpenSpec; no modifica código, SQL ejecutable, datos, usuarios ni políticas remotas.

### Dependencias y límites entre Changes

Primero en el roadmap; habilita CHG-01, CHG-03 y la preparación de CHG-04/05. La contención temporal no sustituye las políticas permanentes de CHG-05.

### Criterios de aceptación

Contención negativa probada sin leer filas privadas; restauración verificada en entorno aislado; rotaciones, riesgos y aprobación del propietario documentados. Los escenarios de `specs/database-access-containment/spec.md` especifican las comprobaciones de la futura implementación; validar estos documentos no equivale a superar esas pruebas.

### Riesgos y recuperación

Bloqueo del cliente heredado, costo de staging y recuperación incompleta; recuperar solo una configuración segura, sin reabrir acceso anónimo. El detalle del procedimiento está en `design.md`.

### Decisiones antes de implementar

Proyecto/remote correcto, propietario del incidente, interrupción admisible, ventana, RPO/RTO, presupuesto de staging y responsables de rotación. Toda intervención en el despliegue requiere autorización humana y respaldo/restauración aprobados conforme a CHG-00.

### Estado de validación de planificación

Validación individual aprobada con OpenSpec 1.14.3: `openspec validate chg-00-containment-backups-staging --strict --no-interactive`. Cuatro artefactos completos y exactamente tres tareas pendientes, sin subtareas. La validación comprueba los documentos, no la eficacia de las futuras remediaciones en Supabase. Revisión final del conjunto: 2026-10-20.

