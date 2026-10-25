# CHG-04 - Decision aprobada y activacion Cloud pendiente

## Decision aprobada

El 2026-10-22 se aprobo que cada empleado use una identidad individual de Supabase Auth, vinculada a un correo unico, verificado y bajo su control. El login visible sigue usando username y contrasena. Las cuentas se crean solo por invitacion administrativa confiable; no hay registro publico, cuentas de correo compartidas ni direcciones inventadas.

La recuperacion usa `resetPasswordForEmail` de Supabase Auth y el cambio de clave usa `auth.updateUser`. La respuesta publica es generica y no revela el correo asociado. El enlace oficial de Auth debe estar vigente y llegar a la ruta de cambio de contrasena.

## Excepcion pendiente

El personal que no disponga de correo individual queda como excepcion pendiente de aprobacion. Su cuenta permanece inactiva y sin recuperacion hasta que exista una decision separada. No se habilita un procedimiento manual o alternativo por inferencia.

## Gate de Cloud

Recovery y provisioning siguen apagados en Cloud hasta configurar y verificar el correo transaccional, el origen permitido y las URL de redirect. Los flags de cliente y servidor se conservan apagados por defecto. La suite local los habilito mediante un env-file efimero solo para el proceso de prueba; ese archivo temporal se elimina al detenerlo. No se cambiaron variables persistentes ni se ejecutaron migraciones en Cloud.

## Evidencia local Auth/Mailpit

- Invitacion administrativa real a identidad sintetica; el perfil inicia inactivo y solo se activa despues de verificar el enlace oficial Auth.
- Enlace de invitacion invalido rechazado; enlace valido confirma la identidad, permite fijar clave e iniciar sesion por username.
- Recovery para usuario conocido/desconocido/repetido devuelve respuesta identica y generica; Mailpit recibe un unico correo de la cuenta individual verificada.
- Enlace de recovery invalido rechazado; enlace valido abre cambio de clave oficial; la nueva clave autentica y la anterior deja de hacerlo. Se prueba logout.
- JWT expirado es rechazado por Auth y REST; token vigente de perfil revocado pierde acceso inmediatamente.
- `tests/security.integration.test.mjs`: 22/22 escenarios pasan contra Supabase local y Mailpit, con fallos inducidos de persistencia y compensacion.

## Compensacion entre Auth y PostgreSQL

Auth y PostgreSQL no comparten transaccion. La invitacion crea Auth y luego el perfil. Si PostgreSQL rechaza el INSERT, Edge intenta borrar Auth. Un CHECK real confirma que la compensacion exitosa no deja identidad ni perfil. Si se inyecta un fallo de transporte, el handler devuelve 503 sin exito, registra una incidencia privada, mantiene la identidad parcial y bloquea activacion con 423. Un administrador autenticado resuelve la incidencia; la prueba confirma Auth eliminado, sin perfil y la incidencia cerrada. Si la resolucion falla en produccion, la incidencia permanece abierta para reintento.

CHG-04 queda en 3/3 con evidencia local. Configurar/verificar SMTP y redirect de Cloud sigue siendo una dependencia operativa; Cloud permanece apagado. La excepcion para empleados sin correo individual sigue pendiente de aprobacion.

Los fault tests se habilitaron mediante variables efimeras y prefijos sinteticos reservados. El fallo del perfil ejercita una constraint PostgreSQL real; el fallo Auth Admin es una inyeccion controlada en el limite de transporte. Esto demuestra compensacion verificable, no atomicidad distribuida. Si PostgreSQL tambien falla al registrar la incidencia, el Edge Function escribe detalles en su log privado; la recuperacion de esa doble falla requiere intervencion administrativa manual.
