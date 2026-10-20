# Proposal — Identidad verificada con Supabase Auth

## Why

`src/lib/auth.tsx` compara contraseñas en `public.users`, restaura un objeto de navegador como sesión y permite registro con rol admin. La identidad debe provenir de Supabase Auth y de administración privilegiada verificada.

## What Changes

- **BREAKING**: migrar cuentas mediante invitación/restablecimiento forzado sin importar ni reutilizar secretos heredados.
- Verificar sesiones y roles desde identidad confiable; sustituir registro auto-admin y CRUD público de empleados por administración de servidor.
- Ensayar bootstrap, revocación, sesiones y despliegue coordinado CHG-04/05 con denegación por defecto.

## Capabilities

### New Capabilities

- `verified-user-identity`: identidad verificada con supabase auth.

### Modified Capabilities

Ninguna; el inventario inicial de especificaciones principales está vacío.

## Impact

`src/lib/auth.tsx`, `src/routes/login.tsx`, `src/routes/_app.tsx`, `src/routes/_app/team.tsx`, perfiles/roles y futuro endpoint privado de administración Auth.

### Objetivo, evidencia y trazabilidad

Findings 2, 3, 12, según el roadmap. Estado: propuesta de planificación; ninguna medida está implementada ni verificada en el despliegue por esta ejecución. Fuente principal: `docs/database-remediation-roadmap.md`; no se encontró el informe original de auditoría, por lo que la numeración de Findings procede exclusivamente del roadmap.
La evidencia local detallada y sus límites se registran en `design.md`.

### Alcance y exclusiones

Este Change cubre únicamente la capacidad declarada. Quedan fuera DGII/e-CF, rediseño UI, actualizaciones de dependencias (CHG-02), limpieza general de caché entre usuarios (CHG-09) y QA integral de Phase 3. Esta entrega solo crea planificación OpenSpec; no modifica código, SQL ejecutable, datos, usuarios ni políticas remotas.

### Dependencias y límites entre Changes

CHG-00 primero; coordinación con la fuente versionada CHG-03. CHG-04 y CHG-05 se preparan secuencialmente y se activan en una única ventana conjunta; ninguna se despliega de forma insegura por separado.

### Criterios de aceptación

Sin contraseñas en registros públicos; sesión falsificada rechazada; empleado no puede elevar rol y cuenta revocada no accede con token aún no expirado. Los escenarios de `specs/verified-user-identity/spec.md` especifican las comprobaciones de la futura implementación; validar estos documentos no equivale a superar esas pruebas.

### Riesgos y recuperación

Bloqueo de cuentas o bootstrap incorrecto; recuperar a mantenimiento seguro o release Auth/RLS validada, nunca al login heredado. El detalle del procedimiento está en `design.md`.

### Decisiones antes de implementar

Aprobar canal de recuperación e identificación de cuentas, administrador inicial fuera de banda y ventana compartida con CHG-05. Toda intervención en el despliegue requiere autorización humana y respaldo/restauración aprobados conforme a CHG-00.

### Estado de validación de planificación

Validación individual aprobada con OpenSpec 1.14.3: `openspec validate chg-04-auth-identity-migration --strict --no-interactive`. Cuatro artefactos completos y exactamente tres tareas pendientes, sin subtareas. La validación comprueba los documentos, no la eficacia de las futuras remediaciones en Supabase. Revisión final del conjunto: 2026-10-20.

