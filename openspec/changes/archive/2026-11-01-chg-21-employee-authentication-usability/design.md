# Design — CHG-21 / Empleados y acceso seguro

## Contexto confirmado

- En `src/routes/_app/team.tsx` el texto de invitación/activación conserva mensajes ingleses; `!u.active` muestra «Pendiente de correo confirmado», aunque el dato `active` no permite saber si el correo fue confirmado. Roles y permisos se editan con peticiones a `manage-profile`; existe confirmación de revocación y un estado `pending` global.
- `src/lib/auth.tsx` usa `username-login`, `manage-profile`, sesión Supabase, guardas de autorización vigentes y aislamiento de caché; los callbacks de enlace conservan una sesión transitoria de cambio de contraseña. No reemplazar esta arquitectura.
- Login muestra «Verificando sesión…» mientras `authReady=false`. En pruebas anteriores apareció bloqueo intermitente, no reproducido aisladamente; diagnosticar con una prueba focalizada y evidencia, no asumir defecto.
- El flujo de recuperación devuelve texto genérico para no revelar si existe un usuario; la función está deshabilitada salvo configuración explícita. La invitación requiere configuración local/Cloud validada; `ACCOUNT_PROVISIONING_ENABLED` es una guarda de servidor, `VITE_ACCOUNT_PROVISIONING_ENABLED` solo gobierna UI.

## D1 — Panel de empleados, autorización y estados (tarea 1.1)

- Mostrar nombre, usuario, rol, permisos, estado de cuenta y acciones. Los estados **deben basarse en hechos observables**: `active=true` -> activa; `active=false` -> inactiva / pendiente de activación o verificación, pero NO afirmar «correo sin confirmar». Diferenciar «invitación solicitada/aceptada por servicio» de «correo recibido/confirmado» y de «cuenta activada»; solo presentar estado más específico con una fuente autorizada del servidor. Si la UI necesita conocer `email_confirmed_at`, diseñar consulta/admin controlado sin exponer correo ni estados privados a empleados.
- Completar traducciones al español (incluidos errores y mensajes provenientes de `manage-profile` cuando deban mostrarse), con identificaciones accesibles y foco/estado anunciado. Deshabilitar reenvío del mismo comando mientras está pendiente; evitar que operaciones simultáneas sobre una cuenta se pisen.
- Invitación: validar nombre de usuario, nombre y correo sin reflejarlo a terceros; respetar `ACCOUNT_PROVISIONING_ENABLED` y orígenes autorizados. Las cuentas invitadas **empiezan inactivas**, solo se activan con correo efectivamente confirmado y verificación del servidor. No generar administradores desde la invitación.
- Rol/permisos: confirmación para elevación a admin o reducción de autoridad y revocación, prevenir autoedición privilegiada donde ya se prohíbe y no representar éxito hasta que la función persista el resultado; en errores 401/403/revocación actualizar estado local de forma segura. Evitar que la UI sea la única barrera.
- Respetar política del servidor sobre administrador activo y reglas de permisos; no agregar acciones de reenvío de correo o «desrevocar» que no existan realmente en el backend.

## D2 — Login, recuperación y contraseña (tarea 2.1)

- Mantener mensajes en español, validación clara, etiquetas y errores con `role=alert`/aria-describedby, gestión del foco y estados ocupados; preservar el nombre de usuario ante error, borrar contraseña según seguridad y no guardar credenciales en storage.
- Revisar con evidencia estados `authReady`, eventos `INITIAL_SESSION`/`SIGNED_IN`, `TOKEN_REFRESHED`, callbacks y conflictos de sesión; corregir una carrera real solo si se reproduce. No implementar `setTimeout` que declare login exitoso o autenticado sin perfil verificado. Tratar cuentas inactivas/revocadas mediante respuesta del servidor sin filtraciones.
- Recuperación por usuario con mensaje genérico que no permita inferir existencia o correo; no mostrar correo privado ni errores diferenciales sensibles. Preservar enlace de invitación/recuperación, validación de expiración/reutilización, contraseña inicial con sesión temporal, logout posterior y aislamiento de otra sesión. No dejar callback con sesión privilegiada residual.
- Flags cliente/servidor deshabilitados por defecto para recovery/provisioning; no activar correo real sin confirmación de dominio, SMTP y orígenes. Reparar texto mojibake solo en archivos modificados.

## D3 — QA enfocada y segura (tarea 3.1)

- Usar únicamente stack Supabase **local desechable, inequívocamente identificado**, con Auth, REST, Edge Functions requeridas y Mailpit listos; no modificar el stack habitual ni Cloud. Configurar `ACCOUNT_PROVISIONING_ENABLED`, `ACCOUNT_RECOVERY_ENABLED` y orígenes de redirección solo donde las pruebas lo requieran; nunca incluir banderas locales de fault injection en configuración permanente.
- Pruebas: invitación admin/empleado denegada, correo recibido en Mailpit, identidad inicialmente inactiva, contraseña mediante enlace, activación únicamente tras verificación Auth, permisos reales, acciones de rol autorizadas, autoescalación denegada, revocación inmediata incluso con token antiguo, sesión múltiple/aislamiento, recuperación de usuario existente/inexistente sin enumeración, enlaces expirados/usados, reintento/errores de red, teclado/foco y móvil.
- Reproducir aisladamente el antiguo estado «Verificando sesión…» bajo sesión limpia y luego contrastar con ejecución focalizada. Si no reproduce, no declarar una corrección ficticia; registrar observación. Suites que dependan de catálogo vacío u otros datos previos deben preparar sus propios fixtures o declarar precondición, sin limpiar datos ajenos.
- Ejecutar `npm test`, TypeScript, ESLint de archivos afectados, build, pruebas focalizadas Playwright, Auth/RLS integradas relevantes, `openspec validate chg-21-employee-authentication-usability --strict` y `git diff --check`. No realizar auditorías globales Docker/JWT sin fallo concreto. No marcar 3/3 si una prueba de seguridad propia falla.

## Riesgos y fuera de alcance

- El listado `user_profiles` no contiene estado de entrega de correo ni fecha de confirmación. Evitar prometer 5 estados verificables sin datos; mostrar lo conocido y complementar solo con un endpoint administrativo mínimo si un criterio lo exige.
- Retener privacidad y no exponer datos de Auth Admin al navegador.
- Pruebas de Mailpit necesitan un servicio real de correo local y redirecciones correctas; no afirmar que las invitaciones o recuperación funcionaron si no se verificaron.
- Los Changes archivados 18/19 y los archivos locales protegidos deben permanecer intactos; ningún commit, push, merge o archivo al realizar Apply sin autorización adicional.
