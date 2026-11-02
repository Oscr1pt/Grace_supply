# Tasks — CHG-22-SECURE-USER-CREATION-EDITING

> Change activo, **0/3 tareas**. Se implementa después de verificar que FIX-01/02 están publicados en `feature/frontend-improvements`. Máximo tres tareas; sin commit, push, merge ni archive durante Apply.

## 1. Alta diferenciada y formulario administrativo
- [ ] **1.1** Crear una ruta protegida independiente (ej. `/team/new`) con nombre, username, teléfono, correo individual, contraseña inicial y confirmación, y selector de rol empleado/admin; vincular desde `/team`. Separar pantalla/URL de primer acceso de recuperación (`/setup-account` versus `/reset-password`) reutilizando callbacks seguros; validaciones y accesibilidad. **Verificar:** rutas correctas, campos, mensajes en español, errores y navegación de regreso sin bucle.

## 2. Persistencia y edición seguras
- [ ] **2.1** Implementar alta autorizada mediante Supabase Auth + perfil inactivo con rol seleccionado y teléfono mediante migración versionada, RLS/grants mínimos y comprobación de identidad. Password solo en Auth vía servidor; no secretos en BD/logs/respuestas; verificar seguridad de contraseña inicial/rotación antes de habilitarla. Mantener correo confirmado + activación explícita, proteger admin, último admin y compensación Auth/perfil. Extender edición de nombre/teléfono/rol/permisos desde `/team`, sin autoescalación ni falsos éxitos. **Verificar:** inserción/edición persistida, duplicados, roles, activación y fallas parciales; si la contraseña inicial no puede protegerse, reportar bloqueo sin marcar 2.1 completa.

## 3. Verificación de seguridad y funcionalidad
- [ ] **3.1** Probar E2E con datos sintéticos en stack local desechable: creación/edición, rol admin/employee, correo/confirmación vía Mailpit, password inicial, login, configuración de cuenta separada del reset, permisos y RLS, usuario duplicado, validación teléfono, compensación, errores de red, enlaces vencidos, salida a login FIX-01 y responsive/teclado. Ejecutar pruebas Auth/RLS pertinentes, Playwright específico, `npm test`, TypeScript, ESLint afectado, build, `git diff --check` y OpenSpec estricto. **Verificar:** no privilegios indebidos ni credenciales expuestas; 3/3 únicamente con evidencia real.

> Evitar infraestructura adicional innecesaria. Preservar cambios locales ajenos, archivos protegidos y Changes archivados. No tocar facturación, inventario ni configuraciones Cloud.
