# Tasks

## 1. Reproducibilidad y migraciones

- [x] 1.1 Deshabilitar el seed no existente en `supabase/config.toml` (o añadir solo un seed sintético revisado si aparece una necesidad real) y verificar en el stack desechable que el reset limpio no intenta cargar un archivo ausente ni agrega cuentas o transacciones comerciales.
- [x] 1.2 Inventariar las 15 migraciones instalables, su orden, dependencias y precondiciones; confirmar con revisión y prueba desde cero que no requieren usuarios ni filas de negocio sintéticas del stack local actual y que la migración legacy queda fuera de la secuencia.
- [x] 1.3 Reconstruir dos veces en un stack Supabase/PostgreSQL desechable con `project_id`, puertos y contenedores separados; verificar historial completo y firmas de esquema idénticas, ejecutar las aserciones SQL y retirar solo ese stack temporal, sin tocar la instancia local existente.

## 2. Configuración y bootstrap

- [x] 2.1 Documentar e implementar el runbook confiable de primer administrador con invitación Supabase Auth, perfil inicial inactivo y activación solo tras confirmar la identidad; verificar que no existe endpoint público de bootstrap ni clave privilegiada en código cliente.
- [x] 2.2 Probar el flujo local con identidad sintética y Mailpit: creación e invitación, activación verificada, rechazo de repetición/concurrencia y recuperación segura tras fallo de inserción o activación, sin duplicar identidad ni reportar éxito falso.
- [x] 2.3 Inventariar SMTP, dominio, Site URL/redirects, variables de frontend y secretos/flags de Edge Functions; comprobar que recovery/provisioning siguen en `false` hasta cumplir los gates y que los valores secretos no aparecen en bundle o evidencia.

## 3. Plan de validación Cloud

- [x] 3.1 Documentar, sin ejecutarlos, los comandos para enlazar explícitamente `qazjfofpfcwopcefupjl`, listar y comparar el historial con `supabase migration list --linked`, y revisar `supabase db push --dry-run --linked`; especificar que cualquier inspección remota requiere autorización independiente y que no se incluye push real, reset, repair ni despliegue de Functions.
- [x] 3.2 Crear la lista de verificación post-despliegue para RLS por rol/revocación, Auth e invitaciones, caché entre sesiones, atomicidad/idempotencia, auditoría/anulaciones y Edge Functions; registrar criterios de aprobación y condiciones de parada ante ref, historial, drift, SMTP, backup o permisos inesperados.
- [x] 3.3 Actualizar `docs/deployment-readiness-qazjfofpfcwopcefupjl.md` con el inventario de configuración, el procedimiento de bootstrap, las evidencias obtenidas, los riesgos/bloqueos pendientes y el dictamen final; mantener separados Cloud de desarrollo y producción y dejar ventas bloqueadas hasta aprobar tasa, impuestos incluidos y redondeo.
