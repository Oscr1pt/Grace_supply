# Design

## Context

El cliente actual mantiene sesión local y consulta la tabla users con un campo password. Grace Supply aún está en desarrollo; las cuentas y contraseñas actuales son datos de prueba y no se migrarán. El nuevo acceso debe conservar la experiencia de nombre de usuario y contraseña, usando Supabase Auth para verificar la contraseña.

## Goals / Non-Goals

**Goals:** vincular cada perfil con una identidad Auth individual, verificar permisos en servidor y ofrecer recuperación por correo asociado.

**Non-Goals:** preservar cuentas o contrasenas legacy de prueba, permitir auto-registro admin o revelar correos a partir de usernames.

## Decisions

### Username y Supabase Auth

Supabase Auth será la autoridad para contraseñas y sesiones. El perfil de aplicación almacena un username normalizado y único, el ID de auth.users y los datos de rol/permisos no secretos. La interfaz seguirá solicitando username y password.

Como Auth autentica mediante correo/contraseña, resolver username a identidad de Auth dentro de un endpoint de servidor confiable. El endpoint verifica entrada, rate limit y estado activo, responde con errores genéricos y nunca revela si un username o correo existe. No crear un endpoint público que devuelva el correo asociado. Las contraseñas no se guardan, comparan ni devuelven desde tablas de aplicación.

### Recuperación

El propietario aprobo el 2026-10-22 que cada identidad Auth use un correo individual, unico y verificado bajo control del empleado, conservando el login username/contrasena. Si un empleado no dispone de un correo individual, su alta y recuperacion quedan pendientes de una excepcion aprobada; no se inventan direcciones ni se comparten cuentas. La recuperacion usa el flujo oficial de Auth, responde igual para cuentas conocidas/desconocidas y no revela el correo.

Recovery y provisioning siguen apagados en Cloud hasta configurar y verificar SMTP transaccional, origen permitido y URL de redirect. Los flags efimeros usados en pruebas se limitan a Supabase local y no se guardan en configuracion del proyecto.

### Perfil, privilegios y sesiones

Vincular perfiles por auth.users.id. Roles, permisos y estado activo se leen de una fuente protegida y se comprueban en las operaciones del servidor/RLS conforme a CHG-05. No confiar en localStorage, user metadata, roles o IDs enviados por el navegador. Las cuentas de desarrollo se crean nuevas y sintéticas. Bootstrap admin se realiza fuera del registro público, con cierre verificable del procedimiento inicial.

### Aprovisionamiento y revocación

Auth Admin y PostgreSQL no comparten transacción. Crear cuentas inactivas hasta completar identidad y perfil; fallos parciales deben dejar acceso denegado y permitir reparación idempotente. Revocar primero el perfil y comprobar el estado en cada operación, incluso con JWT aún vigente. Coordinar autenticación y RLS con CHG-05.

## Risks / Trade-offs

- Username no es credencial nativa de Supabase Auth → resolverlo en servidor con rate limiting y respuesta genérica.
- Empleado sin buzon individual controlado -> mantener cuenta y recuperacion inactivas; documentar la excepcion y aprobar por separado cualquier alternativa. No inventar un proceso provisional.
- Fallo parcial Auth/perfil → estado inactivo por defecto y reparación segura.
- Token aún vigente → verificar estado y permisos al autorizar cada operación.

## Migration Plan

No se migran cuentas existentes. Crear cuentas sintéticas nuevas para desarrollo, probar username/password a través de Auth, recuperación por correo, bootstrap, logout, expiración y revocación. Desplegar el modelo Auth y CHG-05 en conjunto antes de exponer operaciones privadas. Ante fallo, mantener el acceso privado cerrado; no volver a la contraseña en texto ni a una sesión local como autoridad.

### Compensacion verificable de altas Auth/perfil

La invitacion crea primero la identidad en Supabase Auth y luego persiste el perfil en PostgreSQL; no existe una transaccion atomica entre ambos servicios. Si el INSERT del perfil falla, la funcion Edge confiable intenta borrar la identidad Auth. Si esa compensacion tambien falla, guarda una incidencia privada en `provisioning_incidents`, devuelve error sin exito y bloquea activacion mientras siga abierta. Un administrador autenticado puede resolverla mediante otra eliminacion compensatoria desde el servidor. Si la resolucion falla, la incidencia permanece abierta para reintento e intervencion. No se confirman perfiles huerfanos ni activaciones como resultado exitoso.

Los puntos de inyeccion de fallo `CHG04_LOCAL_TEST_FAIL_PROFILE_INSERT` y `CHG04_LOCAL_TEST_FAIL_AUTH_CLEANUP` solo actuan cuando la URL de Supabase es loopback y el username lleva el prefijo reservado de prueba. El primero induce un rechazo real del CHECK de PostgreSQL; el segundo simula un fallo de transporte de la compensacion. No se habilitan con una URL Cloud.

