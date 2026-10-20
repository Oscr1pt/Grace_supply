# Design

## Context

Ver `proposal.md` y Findings 2/3/12 del roadmap; informe original no encontrado. En `auth.tsx`, login consulta users con filtro password, registro inserta admin y todos los permisos, y restauración confía en `lustre_session_v2`. Las mutaciones de empleados llegan directamente a users. `_app.tsx` usa ese estado para rutas. No hay modelo de usuario Auth ni canal de email en el tipo heredado, por lo que no se presume que las cuentas puedan invitarse automáticamente. Estado de Auth real no consultado.

## Goals / Non-Goals

**Goals:** identidad de Supabase Auth, perfiles sin secretos, roles controlados por servidor, revocación efectiva y corte coordinado con CHG-05.

**Non-Goals:** reutilizar contraseñas comprometidas, crear una nueva autenticación por comparación de texto, enviar invitaciones en planificación, resolver la retención general de caché (CHG-09) o habilitar permisos por frontend.

## Decisions

### Cuentas por identidad y recuperación verificada

Crear en la futura implementación un perfil vinculado unívocamente al ID de `auth.users`; mantener username normalizado único como alias y nombre visible, sin contraseña. Roles, permisos y estado activo residen en una tabla protegida, modificable solo por administración autorizada. CHG-05 consumirá esa misma fuente y no claims editables por usuario.

Migrar por mapeo restringido de identidad heredada a Auth. El propietario valida titulares y canales de recuperación; cuentas sin canal verificado quedan bloqueadas. Propuesta: email verificado con invitación/reset forzado y acceso por ese canal; conservar username como alias, sin endpoint anónimo que lo traduzca a email ni inventar direcciones. No importar contraseñas ni hashes derivados de ellas. El cambio de acceso se debe comunicar durante la implementación autorizada, no desde esta ejecución.

Alternativas descartadas: hashes de contraseñas expuestas mantienen credenciales comprometidas; direcciones sintéticas impiden recuperación; auto-registro conserva el riesgo de auto-admin.

### Sesión validada y privilegios actuales

El SDK gestiona la sesión de Auth, pero el navegador no es autoridad. El cliente espera validación antes de cargar recursos privados; endpoints de servidor validan token emisor/audiencia/expiración mediante el mecanismo verificado de Auth, y PostgreSQL recibe la identidad del JWT validado. No confiar en `getSession` local o decodificar un token sin verificarlo como prueba de identidad. El contexto de aplicación consulta perfil/permisos autorizados y muestra estado de carga/error; no restaura autoridad desde el objeto heredado.

En cada operación privada, comprobar cuenta activa y permisos vigentes en la fuente protegida. El logout invalida sesión según el servicio y elimina el artefacto heredado; revocación desactiva el perfil antes de invalidar sesiones/refresh tokens. Así un access token todavía vigente no conserva autorización. CHG-05 cubre esta comprobación también en REST/RPC, sin depender de que expire el JWT. No asumir que sign-out invalida inmediatamente todo access token.

### Administración privada y consistencia entre servicios

Usar un endpoint de servidor/función privada con credencial administrativa solo en secretos de servidor. Validar identidad y admin activo antes de llamar Auth Admin; no aceptar role/actor del request como autoridad. Si usa cookies, exigir defensa CSRF/origen; con bearer explícito, verificarlo y restringir CORS, sin credenciales en bundle ni logs.

Alta: crear identidad inicialmente sin acceso; aprovisionar perfil/rol; activar solo cuando ambas partes estén completas. Auth Admin y PostgreSQL no comparten una transacción: un fallo deja la cuenta desactivada y reintento correlacionado repara sin duplicar identidades. Cambio de rol afecta fuente protegida; baja revoca primero, conserva identidad histórica y no borra relaciones financieras. Impedir eliminar/desactivar/degradar el último admin activo; bootstrap inicial fuera de banda verificado por el propietario y cerrado al terminar. No confiar en metadata de usuario para roles.

Alternativa descartada: service_role en cliente o endpoint admin que valide únicamente existencia de token.

## Risks / Trade-offs

- [No hay canales verificados heredados] → verificación del propietario fuera de banda; no habilitar cuentas sin titular confirmado.
- [Fallo a mitad de alta entre Auth y perfil] → estado inactivo por defecto y recuperación idempotente correlacionada.
- [Token sigue vigente tras revocación] → verificar estado activo/permisos en cada operación de DB/servidor con CHG-05.
- [Regresión al login antiguo durante rollback] → modo mantenimiento o release Auth/RLS segura, nunca restaurar mecanismo anterior.
- [Contraseña histórica en respaldo] → acceso/retención restringidos de CHG-00; no propagar ni devolver al esquema público.

## Migration Plan

Requiere CHG-00 y usa versionado CHG-03 antes del corte. Preparar CHG-04 y después CHG-05, una implementación a la vez, sin activación individual insegura. El siguiente runbook es compartido: CHG-04 es dueño de identidades/cliente, CHG-05 de políticas/grants; CHG-00 controla aprobación y recuperación.

En staging: mapeo sintético, reset/invitación, bootstrap y prueba del último admin; sesiones válidas, adulteradas, expiradas, logout y tokens anteriores a revocación; rechazar alta/rol desde empleado y errores parciales de aprovisionamiento. Antes de ventana, comprobar canal de acceso y recuperación del admin.

Ventana conjunta con tráfico cerrado: respaldar y comprobar recuperación; aprovisionar identidades inactivas y perfiles protegidos; aplicar autorización CHG-05 y retirar acceso heredado; invalidar sesiones antiguas y eliminar secretos de registros de aplicación; activar solo identidades verificadas; desplegar cliente Auth; ejecutar matriz REST/RPC y smoke tests de ambas propuestas; propietario autoriza reapertura solo si pasan todas las denegaciones y acceso admin esperado. Ningún lapso admite anon a datos sensibles.

Rollback conjunto: cerrar tráfico, mantener roles/perfiles restrictivos y secretos invalidados, recuperar release Auth/RLS previamente validada o permanecer en mantenimiento. No reintroducir contraseña pública, sesiones falsificables ni políticas permisivas. Eliminación de secretos exige recuperación que preserve el reset, no restauración indiscriminada del backup.

## Decisiones que requieren aprobación

Email verificado como canal propuesto, titulares y resolución de cuentas sin canal, administrador inicial y procedimiento del último admin, ventana única CHG-04/05 y personal autorizado. Estas decisiones se presentan para aprobar antes de implementar; no se autoriza ningún envío ni cambio de usuario en esta ejecución.

