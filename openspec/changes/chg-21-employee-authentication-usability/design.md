# Design — CHG-21-EMPLOYEE-AUTHENTICATION-USABILITY: Empleados, permisos y acceso de usuarios

## Evidencia observada en main
La sección Empleados muestra mensajes de invitación y activación en inglés, no expone todos los estados de aprovisionamiento con claridad y maneja controles de roles/permisos sensibles. Los flujos de login/recover/reset deben seguir siendo comprensibles y seguros en fallos de correo/sesión.

## Archivos y áreas de trabajo
- `src/routes/_app/team.tsx`
- `src/routes/login.tsx`
- `src/routes/recover.tsx`
- `src/routes/reset-password.tsx`
- `src/lib/auth.tsx`
- `tests/browser/invitation-password-setup.spec.mjs`

## Diseño propuesto
- Alinear idioma español, estados de invitación/activación, permisos y revocación con acciones reales y controles de riesgo.
- Mejorar mensajes accesibles y recuperación del formulario en login, recuperación y restablecimiento de contraseña.
- Fortalecer feedback de loading/denied/revoked sin cambiar los contratos seguros de Auth ni abrir auto-registro.

## Restricciones y decisiones
- No habilitar provisioning/recovery por defecto: dependen de SMTP y URL verificados.
- No permitir que se promuevan permisos mediante UI más allá de funciones autorizadas; prohibir autoedición privilegiada.
- Mantener aislamiento de sesiones y estado de contraseña inicial/recovery.
- No anunciar activación si la identidad o correo no están confirmados por el servidor.

## Estrategia de verificación
- Validación del comportamiento autorizado y persistencia real; fallos de API, carga, cero filas y cambios de sesión.
- Captura visual comparativa escritorio/tablet/móvil y revisión de accesibilidad por teclado; no introducir una nueva identidad visual.
- Ejecutar pruebas aplicables del módulo, `npm test`, TypeScript, build y `openspec validate chg-21-employee-authentication-usability --strict` tras implementar.
- Las listas exhaustivas de QA manual (happy/sad/edge) corresponden a la fase 2, una vez completados estos Changes.
