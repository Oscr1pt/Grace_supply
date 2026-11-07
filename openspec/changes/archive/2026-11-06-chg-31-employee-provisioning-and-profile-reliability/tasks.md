# Tasks

## 1. Flujo seguro de invitaciones y activación

- [x] 1.1 Verificar en servidor los prerrequisitos de aprovisionamiento (SMTP/Mailpit, origen público, redirecciones autorizadas y flags) y mantener el flujo cerrado cuando falte alguno.
  - [x] Conservar el registro privado deshabilitado y exigir autorización administrativa efectiva.
  - [x] Mantener la secuencia de invitación, confirmación de correo, contraseña inicial y activación con `manage-profile` y `complete-initial-password`.
  - [x] Preservar compensación Auth/perfil, incidencias bloqueantes y protección frente a duplicados.
  - [x] Exponer estados verificados de correo pendiente, activación pendiente y cuenta activa.

## 2. Confirmación y reconciliación de perfiles

- [x] 2.1 Hacer que las actualizaciones de nombre y teléfono confirmen por identidad y lectura posterior los valores persistidos.
  - [x] Distinguir validación, no autorizado, error de servicio, guardado confirmado y resultado no confirmado.
  - [x] Conservar el borrador ante errores o respuestas incompletas y evitar reintentos automáticos duplicados.
  - [x] Mantener controles de roles, permisos, último administrador, RLS y privacidad de teléfonos.
  - [x] Reconciliar respuestas perdidas sin presentar éxito hasta confirmar el estado real del servidor.

## 3. Pruebas de seguridad, integración y experiencia

- [x] 3.1 Verificar sobre un stack Supabase local desechable las cuatro Edge Functions, invitaciones con Mailpit, confirmación y activación, recuperación y enlaces vencidos, fallos parciales y reconciliación de perfiles.
  - [x] Cubrir administradores, empleados sin permisos, cuentas inactivas, correo no confirmado, revocación y aislamiento de sesiones.
  - [x] Ejecutar Playwright con teclado y responsive para estados de guardado, invitación, correo pendiente, activación, cuenta activa y resultado no confirmado.
  - [x] Ejecutar pruebas unitarias, integración Auth/RLS, TypeScript, ESLint, build, `git diff --check` y OpenSpec strict.
  - [x] Mantener Cloud intacto y no declarar habilitación externa sin SMTP, URLs y Edge Functions verificadas.
