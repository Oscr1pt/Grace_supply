# Tasks

## 1. Alta administrativa y enlace temporal server-side

- [x] 1.1 Verificar la API Auth administrativa fijada para generar enlaces sin envÃ­o (`generateLink` u operaciÃ³n equivalente), documentar expiraciÃ³n/consumo Ãºnico y bloquear el flujo si esas garantÃ­as no existen; implementar `create_user` con secreto efÃ­mero en memoria, correo no confirmado, perfil inactivo y `password_change_required=true`, incluyendo compensaciÃ³n e incidencia ante fallos. Verificar con pruebas de integraciÃ³n que no se persistan contraseÃ±as, tokens ni enlaces.
- [x] 1.2 Emitir la URL de `/setup-account` una sola vez al administrador, registrar Ãºnicamente metadatos no secretos y rechazar duplicados, enlaces vencidos/reutilizados, revocaciones y activaciones prematuras. Verificar Auth/RLS con administrador, empleado, anÃ³nimo, cuenta inactiva y protecciÃ³n del Ãºltimo administrador.
- [x] 1.3 Retirar el uso operativo de `invite_employee` de la interfaz y definir la compatibilidad server-side para llamadas antiguas sin abrir un segundo flujo. Verificar que no se envÃ­an correos automÃ¡ticamente, que el registro pÃºblico sigue deshabilitado y que la compensaciÃ³n no deja identidades habilitadas.

## 2. Experiencia de creaciÃ³n, configuraciÃ³n y activaciÃ³n

- [x] 2.1 Adaptar `TeamCreateUserPage` y `team.tsx` para solicitar solo nombre, usuario, correo y permisos/rol, mostrar la URL temporal una vez y exponer estados de enlace generado, configuraciÃ³n pendiente, activaciÃ³n pendiente, activo, denegado y no confirmado sin guardar secretos en el navegador. Verificar accesibilidad y persistencia segura del estado.
- [x] 2.2 Mantener `SetupAccountPage` y `complete-initial-password` como Ãºnico mecanismo de contraseÃ±a inicial; validar sesiÃ³n temporal, correo, expiraciÃ³n, consumo Ãºnico, cierre de sesiÃ³n y bloqueo de Ã¡reas privadas. Verificar login posterior, enlace vencido, reutilizaciÃ³n y revocaciÃ³n.
- [x] 2.3 Reproducir y corregir Ãºnicamente si corresponde al flujo la confirmaciÃ³n E2E fallida de ediciÃ³n de perfil, reconciliando por identidad y valores persistidos sin reintentos automÃ¡ticos. Verificar nombre, telÃ©fono, permisos y mensajes de resultado confirmado/no confirmado tras recargar.

## 3. ValidaciÃ³n integral y documentaciÃ³n operativa

- [x] 3.1 Ejecutar en Supabase local desechable Auth/RLS, integraciÃ³n, Playwright y pruebas unitarias para alta administrativa, enlace real, setup, activaciÃ³n, login, duplicados, fallos parciales, revocaciÃ³n y ediciÃ³n; verificar que cada escenario usa datos sintÃ©ticos y no SMTP/Cloud.
- [x] 3.2 Ejecutar TypeScript, ESLint afectado, build, `git diff --check` y `openspec validate chg-32-managed-employee-provisioning --strict`; registrar cualquier bloqueo de la API Auth o del runtime sin relajar controles.
- [x] 3.3 Documentar prerrequisitos de habilitaciÃ³n (despliegue de funciones, origen/redirecciÃ³n, verificaciÃ³n administrativa del empleado, expiraciÃ³n y procedimiento de revocaciÃ³n) y comprobar que ningÃºn secreto, enlace o contraseÃ±a aparece en logs, respuestas persistentes o artefactos de prueba.

## Workflow follow-up

- Revisar y aprobar los artefactos antes de iniciar `openspec-apply-change`.
- No desplegar Cloud, ejecutar `db push`, hacer commit, push ni archivar durante la implementaciÃ³n inicial.
