# Proposal — Esquema reproducible y versionado

## Why

El repositorio solo aporta dos SQL parciales y permisivos; `uid()` genera identificadores de texto frente a UUID en esos scripts. Hace falta una fuente versionada que reconcilie esquema desplegado, tipos y consultas sin asumir que el SQL local refleja producción.

## What Changes

- Inventariar tablas, columnas, identificadores, relaciones y políticas usando contratos locales y metadatos autorizados del despliegue.
- Diseñar migraciones versionadas, baseline seguro, compatibilidad/backfill y sustitución de SQL heredado como ruta de instalación.
- Verificar instalación limpia y actualización en staging, con conservación de datos y recuperación.

## Capabilities

### New Capabilities

- `reproducible-database-schema`: esquema reproducible y versionado.

### Modified Capabilities

Ninguna; el inventario inicial de especificaciones principales está vacío.

## Impact

Futura carpeta `supabase/migrations/`, ambos SQL heredados, `src/lib/types.ts`, `src/lib/supabase.ts`, `src/lib/storage.ts` y consultas de rutas.

### Objetivo, evidencia y trazabilidad

Findings 8, 9, según el roadmap. Estado: propuesta de planificación; ninguna medida está implementada ni verificada en el despliegue por esta ejecución. Fuente principal: `docs/database-remediation-roadmap.md`; no se encontró el informe original de auditoría, por lo que la numeración de Findings procede exclusivamente del roadmap.
La evidencia local detallada y sus límites se registran en `design.md`.

### Alcance y exclusiones

Este Change cubre únicamente la capacidad declarada. Quedan fuera DGII/e-CF, rediseño UI, actualizaciones de dependencias (CHG-02), limpieza general de caché entre usuarios (CHG-09) y QA integral de Phase 3. Esta entrega solo crea planificación OpenSpec; no modifica código, SQL ejecutable, datos, usuarios ni políticas remotas.

### Dependencias y límites entre Changes

Requiere CHG-00; entrega baseline y estrategia de IDs para CHG-06. CHG-05 es dueño de autorización permanente; CHG-03 nunca introduce políticas públicas permisivas.

### Criterios de aceptación

Instalación limpia y actualización sintética reproducibles; contratos de columnas/IDs compatibles; sin políticas abiertas ni pérdida de registros. Los escenarios de `specs/reproducible-database-schema/spec.md` especifican las comprobaciones de la futura implementación; validar estos documentos no equivale a superar esas pruebas.

### Riesgos y recuperación

Deriva remota desconocida, conversiones no reversibles y bloqueo por backfill; expansión/contracción con mapeo durable y restauración ensayada. El detalle del procedimiento está en `design.md`.

### Decisiones antes de implementar

Aprobar destino de IDs, ventana de compatibilidad y resolución de diferencias reales del esquema antes de aplicar migraciones. Toda intervención en el despliegue requiere autorización humana y respaldo/restauración aprobados conforme a CHG-00.

### Estado de validación de planificación

Validación individual aprobada con OpenSpec 1.14.3: `openspec validate chg-03-versioned-schema-migrations --strict --no-interactive`. Cuatro artefactos completos y exactamente tres tareas pendientes, sin subtareas. La validación comprueba los documentos, no la eficacia de las futuras remediaciones en Supabase. Revisión final del conjunto: 2026-10-20.

