# Proposal — Autorización de base de datos con mínimo privilegio

## Why

Los SQL locales declaran políticas `FOR ALL USING (true)` y las rutas basan permisos en estado de navegador. Se necesita autorización efectiva en tablas y funciones, cuya existencia en el despliegue aún debe verificarse.

## What Changes

- Definir matriz explícita de filas y operaciones para anónimo, empleado por permiso, administrador y revocado.
- **BREAKING**: establecer RLS, grants y ejecución de funciones con denegación por defecto y sin políticas permisivas globales.
- Verificar acceso directo REST/RPC y activar junto con CHG-04 en el mismo corte de seguridad.

## Capabilities

### New Capabilities

- `database-authorization`: autorización de base de datos con mínimo privilegio.

### Modified Capabilities

Ninguna; el inventario inicial de especificaciones principales está vacío.

## Impact

Todas las tablas consultadas, futuras tablas relacionales/auditoría y RPC, políticas/grants, perfiles/roles de CHG-04 y permisos de `src/lib/auth.tsx`.

### Objetivo, evidencia y trazabilidad

Findings 1, 3, 9, según el roadmap. Estado: propuesta de planificación; ninguna medida está implementada ni verificada en el despliegue por esta ejecución. Fuente principal: `docs/database-remediation-roadmap.md`; no se encontró el informe original de auditoría, por lo que la numeración de Findings procede exclusivamente del roadmap.
La evidencia local detallada y sus límites se registran en `design.md`.

### Alcance y exclusiones

Este Change cubre únicamente la capacidad declarada. Quedan fuera DGII/e-CF, rediseño UI, actualizaciones de dependencias (CHG-02), limpieza general de caché entre usuarios (CHG-09) y QA integral de Phase 3. Esta entrega solo crea planificación OpenSpec; no modifica código, SQL ejecutable, datos, usuarios ni políticas remotas.

### Dependencias y límites entre Changes

CHG-00 contiene exposición; CHG-03 versiona DDL. Dependencia bidireccional de despliegue con CHG-04: JWT verificado y permisos de servidor deben existir antes de habilitar tráfico; habilita CHG-07.

### Criterios de aceptación

Anónimo y revocado no leen ni escriben datos privados; empleados solo operan dentro de permisos; no se eluden reglas mediante REST, RPC o cambios de identidad en payload. Los escenarios de `specs/database-authorization/spec.md` especifican las comprobaciones de la futura implementación; validar estos documentos no equivale a superar esas pruebas.

### Riesgos y recuperación

Bloqueo de flujos por dependencias de lectura y funciones privilegiadas excesivas; recuperar con tráfico cerrado o release segura conjunta. El detalle del procedimiento está en `design.md`.

### Decisiones antes de implementar

Aprobar la matriz propuesta, especialmente lectura mínima para ventas, manejo de gastos y acciones reservadas a administrador. Toda intervención en el despliegue requiere autorización humana y respaldo/restauración aprobados conforme a CHG-00.

### Estado de validación de planificación

Validación individual aprobada con OpenSpec 1.14.3: `openspec validate chg-05-rls-least-privilege --strict --no-interactive`. Cuatro artefactos completos y exactamente tres tareas pendientes, sin subtareas. La validación comprueba los documentos, no la eficacia de las futuras remediaciones en Supabase. Revisión final del conjunto: 2026-10-20.

