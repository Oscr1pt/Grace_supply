# CHG-21 — Empleados, permisos y experiencia de acceso

## Why

La sección de empleados y los flujos de autenticación de Grace Supply ya usan Supabase Auth, perfiles protegidos por RLS y la Edge Function administrativa `manage-profile`; no se necesita reconstruir esa infraestructura. Sin embargo, el panel contiene mensajes en inglés, trata `active=false` como si siempre significara «correo sin confirmar» (cosa que ese campo no demuestra), y no explica bien los resultados de invitaciones, activación, cambios de permisos y revocaciones. Login, recuperación y cambio de contraseña necesitan errores accesibles y manejo de sesión fiable. Se observó anteriormente un bloqueo intermitente de «Verificando sesión…» en una suite general, sin causa confirmada.

## What Changes

- Mejorar la administración de empleados y permisos: estados sustentados en datos confirmados, acciones sensibles explícitas, mensajes en español, errores de servidor, controles pendientes y interfaz accesible en escritorio/móvil.
- Afinar login, recuperación por nombre de usuario y cambio inicial/restablecimiento de contraseña, respetando callbacks Auth, sesiones temporales y privacidad de la existencia de usuarios.
- Incorporar pruebas enfocadas para invitación/confirmación/activación con Mailpit, expiración y reutilización de enlaces, permisos y revocación efectiva incluso con tokens anteriores, recuperación y aislamiento de sesiones; verificar si el fallo previo de login es reproducible sin asumir una causa.

## Capabilities

### New Capabilities
- `account-access-usability`: experiencia accesible, veraz y segura en gestión de cuentas y acceso.

## Impact

Aplicación: `src/routes/_app/team.tsx`, `src/routes/login.tsx`, `src/routes/recover.tsx`, `src/routes/reset-password.tsx`, y ajustes mínimos en `src/lib/auth.tsx` o helpers existentes cuando sean imprescindibles. Pruebas: `tests/browser/invitation-password-setup.spec.mjs` y pruebas de Auth/RLS o navegador específicas. Reutilizar componentes de diálogos y estados existentes.

## Boundaries

- No abrir registro público, no permitir creación de administradores por invitación, ni habilitar `ACCOUNT_PROVISIONING_ENABLED`/`ACCOUNT_RECOVERY_ENABLED` en producción sin SMTP, orígenes y redirecciones verificados. Sus equivalentes `VITE_*` solo afectan visibilidad de UI y no son control de autorización.
- La autoridad de roles, permisos, activación, recuperación y revocación permanece en Supabase Auth, `manage-profile` y RLS. No modificar políticas, migraciones ni contratos seguros para resolver solo una cuestión visual. Un error demostrado de seguridad que impida los criterios debe resolverse de forma mínima y probada o reportarse como bloqueo, no esconderse.
- No fingir estado de correo verificado o invitación entregada a partir de `active` o de un toast; un cambio se confirma solo tras resultado servidor y actualización efectiva.
- No registrar ni mostrar tokens de invitación/reset, contraseñas, correo privado o secretos. No pruebas destructivas en Supabase Cloud ni cambios financieros.
- Mantener fuera de alcance CHG-18/19 archivados y archivos locales protegidos.

## Acceptance

Tres tareas ejecutables, evidencia real de flujos Mailpit/Auth/RLS, accesibilidad por teclado y móvil, bloqueo efectivo de acciones no autorizadas, feedback español y OpenSpec estricto. Pruebas enfocadas sin exigir repetir una auditoría completa de infraestructura; fallos globales ajenos se informan sin declararlos aprobados.

**Dependencias:** CHG-18 y CHG-19 ya están archivados y publicados en `feature/frontend-improvements`. Solo documentación en esta propuesta; Apply es una fase posterior y no debe comenzar al preparar el PR.
