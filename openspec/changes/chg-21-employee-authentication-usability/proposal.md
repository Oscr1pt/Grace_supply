# CHG-21-EMPLOYEE-AUTHENTICATION-USABILITY — Empleados, permisos y acceso de usuarios

## Why
La sección Empleados muestra mensajes de invitación y activación en inglés, no expone todos los estados de aprovisionamiento con claridad y maneja controles de roles/permisos sensibles. Los flujos de login/recover/reset deben seguir siendo comprensibles y seguros en fallos de correo/sesión.

## What Changes
- Alinear idioma español, estados de invitación/activación, permisos y revocación con acciones reales y controles de riesgo.
- Mejorar mensajes accesibles y recuperación del formulario en login, recuperación y restablecimiento de contraseña.
- Fortalecer feedback de loading/denied/revoked sin cambiar los contratos seguros de Auth ni abrir auto-registro.

## Capabilities
### New Capabilities
- `account-access-usability`: experiencia funcional y visual revisada de Grace Supply.

## Impact
- `src/routes/_app/team.tsx`
- `src/routes/login.tsx`
- `src/routes/recover.tsx`
- `src/routes/reset-password.tsx`
- `src/lib/auth.tsx`
- `tests/browser/invitation-password-setup.spec.mjs`

## Boundaries
- No habilitar provisioning/recovery por defecto: dependen de SMTP y URL verificados.
- No permitir que se promuevan permisos mediante UI más allá de funciones autorizadas; prohibir autoedición privilegiada.
- Mantener aislamiento de sesiones y estado de contraseña inicial/recovery.
- No anunciar activación si la identidad o correo no están confirmados por el servidor.

## Acceptance
Tres tareas verificables; mejoras acotadas, sin alterar contratos financieros/Auth existentes, con regresión funcional, accesibilidad, build y OpenSpec estricto.
