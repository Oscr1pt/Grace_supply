# Primer administrador: procedimiento controlado

Este proceso está pensado para el proyecto nuevo y vacío. Solo un propietario autorizado del proyecto debe ejecutarlo. La invitación de Auth y el SQL Editor son contextos administrativos confiables; la aplicación no expone una ruta de bootstrap ni recibe una clave `service_role`.

## Procedimiento

1. Confirme visualmente el project ref y entorno en el dashboard. Deténgase si ya existe cualquier fila en `public.user_profiles`; no borre filas para habilitar el bootstrap.
2. En **Authentication → Users**, invite el correo individual del propietario. No use una cuenta compartida. Registre el UUID Auth devuelto por el dashboard y verifique que pertenece a esa invitación.
3. Abra `supabase/bootstrap/first-admin-create.sql`. Reemplace `__AUTH_USER_ID__`, `__USERNAME__` y `__DISPLAY_NAME__` por valores revisados. El UUID debe ser el de la invitación; el nombre de usuario acepta letras, números y `_`, de 3 a 32 caracteres. Duplique una comilla simple dentro del nombre visible. No cambie el rol, permisos, estado inactivo ni la guarda de un solo uso. Ejecute la transacción en el SQL Editor del mismo proyecto.
4. El perfil queda como `admin`, `active=false`. El usuario abre el enlace de invitación de Supabase Auth. Compruebe que Auth muestra el correo confirmado para el mismo UUID.
5. Reemplace `__AUTH_USER_ID__` en `supabase/bootstrap/first-admin-activate.sql` por el mismo UUID y ejecútelo desde el SQL Editor. La transacción vuelve a comprobar confirmación, perfil inactivo y ausencia de otro administrador activo. Verifique por separado el acceso del administrador.

Las dos plantillas toman el mismo advisory transaction lock. La primera rechaza cualquier perfil ya existente y comprueba que la identidad Auth existe. La segunda solo activa ese perfil tras confirmación de correo. Errores abortan la transacción. Una activación repetida falla de forma cerrada. Tras el primer perfil, el bootstrap ya no puede crear otra cuenta; las altas posteriores usan `manage-profile` con un administrador activo.

## Fallos y reanudación

- Si falla la inserción del perfil después de invitar, la transacción revierte. Inspeccione la causa y vuelva a ejecutar la plantilla de creación con el mismo UUID Auth; no genere otra identidad ni reenvíe invitaciones a ciegas.
- Si falta la confirmación, el perfil permanece inactivo. El usuario debe completar el enlace Auth y el operador vuelve a comprobar el UUID antes de reintentar activación.
- Si el perfil no está vacío, hay duplicados, aparece otro administrador o no coincide la identidad, deténgase y solicite revisión del propietario. No edite directamente el rol para sortear las guardas.
- Conserve el UUID, hora, operador y resultado como registro administrativo, sin registrar enlaces, tokens ni claves.

## Local vs Cloud

La prueba CHG-10 usa una invitación sintética de Auth local, Mailpit y SQL en un contenedor PostgreSQL desechable. No crea identidades ni cambia configuración Cloud. En Cloud, el propietario tendrá que configurar antes SMTP, HTTPS y redirects, confirmar el ref, crear la invitación desde el dashboard, ejecutar cada plantilla en el SQL Editor y comprobar manualmente el resultado. Esos pasos requieren una autorización Cloud independiente. Las claves de servicio permanecen únicamente en el entorno servidor de Supabase y nunca en el navegador o bundle.
