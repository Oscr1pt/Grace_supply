# Proposal

## Why

Grace Supply ya cuenta con migraciones, Auth, RLS y operaciones financieras verificadas localmente, pero aún no hay una ruta reproducible y revisada para preparar el nuevo proyecto Cloud ni para crear su primer administrador. Este Change debe cerrar esas brechas y dejar una lista concreta de comprobaciones y bloqueos antes de solicitar autorización para cualquier operación remota.

## What Changes

- Reconstruir el esquema en un stack Supabase/PostgreSQL desechable y aislado del stack local actual; decidir explícitamente el comportamiento de seed y verificar el inventario, orden y dependencias de todas las migraciones sin depender de filas sintéticas preexistentes.
- Documentar y probar localmente un bootstrap de un solo uso para el primer administrador mediante Supabase Auth y un contexto administrativo confiable. El proceso debe evitar duplicados, requerir identidad verificada para activar el perfil y ofrecer recuperación ante fallos sin exponer claves privilegiadas al frontend.
- Preparar un runbook de Cloud para el proyecto de desarrollo `qazjfofpfcwopcefupjl`: enlace con ref explícito, comparación del historial, `supabase db push --dry-run`, configuración de SMTP/dominio/redirect URLs/secrets/Edge Functions, verificaciones posteriores y condiciones de parada. El runbook no autoriza ni ejecuta el push, despliegues de Functions ni otras escrituras remotas.
- Mantener desactivados recovery y provisioning en Cloud hasta verificar correo transaccional y URLs; distinguir el entorno Cloud de desarrollo de producción y mantener bloqueadas las ventas mientras no se apruebe la política tributaria.

## Capabilities

### New Capabilities

- `cloud-deployment-readiness`: criterios reproducibles para preparar, inspeccionar y validar un despliegue Cloud sin aplicar cambios remotos durante este Change.

### Modified Capabilities

- `reproducible-database-schema`: define el comportamiento de seed y exige que la reconstrucción no dependa de datos sintéticos locales.
- `verified-user-identity`: concreta el bootstrap confiable, único y recuperable del primer administrador en un proyecto vacío.

## Impact

Cambios previstos en `supabase/config.toml`, pruebas y scripts locales, documentación operativa y las tres capacidades OpenSpec indicadas. No se deben modificar bases Cloud, desplegar migraciones o Edge Functions, ni exponer claves de servicio al navegador. La configuración local existente y sus datos deben permanecer intactos durante la verificación.
