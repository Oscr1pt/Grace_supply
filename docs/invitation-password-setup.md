# Aceptación de invitaciones y contraseña inicial

## Enlaces nuevos

La persona invitada debe abrir el enlace en el mismo navegador donde inició el flujo, si Supabase emitió un callback PKCE. Para callbacks implícitos, la app procesa el token del fragmento URL mediante Supabase Auth. Ambos caminos llevan a `/reset-password`; la contraseña se guarda únicamente con `supabase.auth.updateUser({ password })`.

El callback solo confirma la identidad de Auth. Un perfil administrativo inactivo sigue inactivo hasta que el propietario complete el procedimiento de activación del bootstrap y compruebe que el correo corresponde a la identidad esperada.

## Invitación consumida o vencida

No vuelvas a invitar una dirección que ya corresponde a una identidad Auth y no crees una identidad duplicada. El propietario debe enviar un enlace de recuperación para esa identidad existente desde Supabase Authentication, siempre que SMTP y la URL de redirección estén configurados. La persona abre el enlace y define la contraseña en `/reset-password`. Alternativamente, si la recuperación de usuario está habilitada, puede solicitarla desde `/recover` con su nombre de usuario. La función conserva la respuesta genérica y no revela si existe el usuario.

Tras recuperar la contraseña, el perfil continúa inactivo. La recuperación no concede permisos ni sustituye la activación administrativa.

## Configuración operativa requerida

- Configurar `Site URL` con el origen HTTPS del frontend activo.
- Incluir en Redirect URLs el origen y la ruta `/reset-password` para cada entorno explícitamente aprobado. La URL local habitual de desarrollo es `http://localhost:8080/reset-password`; no debe trasladarse a Cloud.
- Enviar una invitación con `redirectTo` apuntando al origen y a `/reset-password`. Las invitaciones creadas desde el Dashboard pueden usar `Site URL` si no se especificó una redirección; confirmar el contenido real del enlace antes de distribuirlo.
- Verificar SMTP, dominio remitente, plantilla de invitación y plantilla de recuperación mediante un correo de prueba. No habilitar recuperación pública hasta completar esas verificaciones.
- No agregar service-role keys ni otros secretos administrativos al bundle frontend. Las operaciones administrativas permanecen en el contexto confiable existente.

Las ventas siguen bloqueadas hasta que exista una política tributaria aprobada.
