# CHG-22 — Creación y edición administrativa de usuarios

## Why

Actualmente `/team` administra cuentas y envía invitaciones, pero no dispone de una pantalla independiente para crear usuarios completos ni editar su información de contacto. El enlace de invitación conduce al formulario compartido `/reset-password`, lo que confunde alta inicial con recuperación. La tabla `user_profiles` no almacena teléfono, y `manage-profile` invita inicialmente solo a empleados.

La corrección solicitada es permitir a un administrador crear y editar cuentas desde una pantalla dedicada con **nombre, nombre de usuario, teléfono, contraseña inicial y selección del rol**. La plataforma requiere además **correo individual verificable** para Supabase Auth y recuperación.

## What Changes

- Nueva ruta administrativa de alta (por ejemplo `/team/new`) distinta de `/reset-password`. Formulario de nombre, username único, teléfono, correo verificable, rol (empleado/administrador) y contraseña inicial con confirmación. Mostrar explícitamente que el servidor decide si la identidad puede activarse.
- Separar la experiencia de **alta/primera configuración** de la de **recuperación**: el enlace de alta apunta a una ruta dedicada y segura (por ejemplo `/setup-account`), manteniendo los callbacks y sesiones de Supabase Auth. Conservar recuperación de contraseñas en `/reset-password`.
- Ampliar de forma mínima y versionada los datos de perfil para teléfono, y un flujo de creación/edición exclusivamente administrativo en el backend; no almacenar contraseñas en `user_profiles` ni registrar secretos. Reutilizar el flujo de invitación y su compensación ante fallas donde sea posible.
- Mejorar edición de datos de empleados desde el listado (nombre, teléfono, rol y permisos autorizados); el username solo se edita si se diseñan y prueban adecuadamente unicidad y continuidad de acceso, de lo contrario mantenerlo inmutable con aviso claro.

## Capabilities

### New Capabilities
- `secure-user-creation-editing`: alta y edición administrativa segura de cuentas con onboarding separado de recuperación.

## Impact

`src/routes/_app/team.tsx`, nueva ruta administrativa de alta y ruta de primer acceso si aplica, `src/routes/reset-password.tsx`, `src/lib/auth.tsx`, `src/lib/employeeManagement.js` y `supabase/functions/manage-profile/index.ts`. Migración acotada de `user_profiles` para teléfono y sus permisos de lectura, tipos e integración. Pruebas unitarias y Playwright/Auth/RLS específicas.

## Boundaries

- La selección de administrador no puede hacerse por registro público ni por la invitación ordinaria de empleados. Crear administradores adicionales requiere **sesión de administrador activo, autorización y confirmación reforzada de acción sensible en el servidor**; el primer administrador continúa sujeto al bootstrap seguro ya existente.
- Ninguna contraseña se almacena en tablas, logs, URLs, mensajes de error, respuestas, analíticas o estado persistente del navegador. Si el administrador proporciona una contraseña inicial, solo puede llegar por TLS a un servicio autorizado y a Supabase Auth, con mitigación verificable de exposición y cambio inicial antes del acceso privado si se define como temporal. No afirmar que una rotación es obligatoria si el servidor no puede hacerla cumplir.
- No activar perfiles sin correo verificado. No activar `ACCOUNT_PROVISIONING_ENABLED` o recuperación en Cloud sin SMTP y redirecciones autorizadas comprobados. No desactivar RLS, no usar `service_role` en frontend y no alterar el flujo ya reparado del botón volver a login (FIX-01).
- No sustituir el mecanismo de invitación por contraseñas visibles al administrador sin verificar el diseño de seguridad. Si las garantías de contraseña inicial/activación no se pueden cumplir en esta fase, documentar el bloqueo y **no marcar como completado el requisito de contraseña**; preservar el flujo por invitación como alternativa segura.
- No tocar contabilidad, inventario ni los archivos protegidos del checkout.

## Acceptance

Máximo **tres tareas**. Un administrador crea un perfil con nombre/username/teléfono/correo/rol y contraseña inicial manejada exclusivamente por Auth sin datos secretos persistidos; el perfil queda inactivo hasta verificación y activación y la pantalla inicial no es la de recuperación. Un administrador edita datos y roles con resultado confirmado, sin autopromoción indebida ni alteración de usuarios ajenos. Fallos parciales no dejan cuentas habilitadas ni duplicadas. Pruebas reales sobre Auth/RLS, Mailpit, browser, TypeScript/build y OpenSpec estricto.

> Estado: planificación. No incluye implementación ni autoriza habilitar provisioning/SMTP real.
