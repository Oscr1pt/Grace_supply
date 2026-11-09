# Design

## Context

El repositorio ya tiene `TeamCreateUserPage`, `SetupAccountPage`, `manage-profile`, `complete-initial-password`, `username-login` y `provisioning_incidents`. También conserva `invite_employee`, que depende de correo y de `/reset-password`, mientras `create_user` usa `/setup-account` y `password_change_required`. La solución debe mantener Auth, RLS, activación administrativa y compensación sin desplegar cambios durante esta fase.

## Goals / Non-Goals

**Goals:**

- Convertir `create_user` en el único flujo visible y operativo para equipos pequeños.
- Generar un enlace de configuración sin envío automático de correo, entregado una sola vez y con expiración.
- Mantener una identidad Auth no confirmada, perfil inactivo y contraseña pendiente hasta completar el setup.
- Hacer que activación, login, revocación y edición reflejen únicamente estado persistido y reconciliado.
- Corregir la confirmación E2E del perfil si pertenece al mismo flujo.

**Non-Goals:**

- No habilitar registro público, SMTP de producción, despliegues Cloud ni cambios en cuentas reales.
- No conservar dos contratos de contraseña inicial simultáneos.
- No almacenar enlaces, tokens, contraseñas ni credenciales persistentes.
- No modificar Changes archivados ni migraciones históricas.

## Decisions

1. **Un solo flujo administrativo.** La UI usará `create_user`; `invite_employee` dejará de estar disponible para nuevas altas. El endpoint podrá permanecer temporalmente para compatibilidad, pero no se presentará como camino válido y deberá rechazar o migrar de forma segura las llamadas antiguas.

2. **Enlace generado por Auth sin SMTP.** El servidor creará la identidad con un secreto aleatorio efímero mantenido solo en memoria y `email_confirm=false`, y usará la API administrativa vigente de Supabase para generar un enlace de invitación con `redirectTo=/setup-account` sin enviarlo. La implementación debe verificar en la versión instalada que la operación sea de solo generación, que el enlace expire y que Auth impida su reutilización; si no se puede demostrar, el alta permanece bloqueada.

3. **Entrega única y no persistente.** La respuesta administrativa contendrá la URL una sola vez. No se almacenará el valor en `user_profiles`, incidencias, logs, `localStorage` ni `sessionStorage`; solo podrán persistirse metadatos no secretos como actor, identidad, expiración y estado consumido. La UI borrará el valor tras copiarlo o abandonar la pantalla.

4. **Servidor como autoridad.** `complete-initial-password` validará el JWT, correo confirmado, identidad, perfil inactivo y `password_change_required=true`, actualizará Auth y limpiará el flag con una condición transaccional. `activate` seguirá exigiendo flag limpio, correo confirmado e inexistencia de incidencias abiertas.

5. **Compensación.** Si falla la generación del enlace o la inserción del perfil, se cancelará la identidad creada. Si la cancelación falla, se registrará una incidencia bloqueante sin devolver un enlace utilizable. Los duplicados se rechazarán antes de crear identidad.

6. **Confirmación de perfil.** La edición continuará usando `manage-profile` y la reconciliación existente. La prueba E2E se corregirá solo si la evidencia demuestra una respuesta persistida que el frontend no confirma; no se ocultarán resultados inciertos ni se añadirán reintentos automáticos.

7. **Alternativas descartadas.** No se usará una contraseña compartida, `email_confirm=true`, un token propio sin expiración, SMTP obligatorio para el alta inicial ni acceso con service-role desde el navegador.

## Risks / Trade-offs

- **[API de generación no garantiza consumo único]** → bloquear el flujo y conservar el aviso de configuración pendiente; no simular seguridad con un enlace propio.
- **[Pérdida del enlace antes de entregarlo]** → no reemitir automáticamente; permitir una nueva operación administrativa auditada que invalide la anterior.
- **[Identidad creada sin perfil]** → compensación inmediata e incidencia bloqueante si falla.
- **[Entrega manual no prueba propiedad del correo]** → exigir verificación administrativa de la identidad del empleado y mantener `email_confirm=false` hasta el callback de Auth.
- **[Compatibilidad con perfiles creados por `invite_employee`]** → no migrarlos automáticamente; documentar estado y mantener activación bloqueada hasta reconciliación explícita.
- **[Prueba E2E intermitente]** → instrumentar respuesta y relectura con timeouts finitos; nunca convertir un resultado no confirmado en éxito.

## Migration Plan

1. Verificar localmente la API Auth de generación de enlaces y su comportamiento de expiración/reutilización.
2. Añadir, solo si es necesario, una migración forward-only para metadatos no secretos de consumo o revocación; no almacenar tokens en claro.
3. Implementar servidor y UI detrás de una bandera local; mantener el aprovisionamiento Cloud deshabilitado.
4. Ejecutar Auth/RLS, integración y Playwright con usuarios sintéticos y Mailpit solo para inspeccionar el enlace, no para enviar correo real.
5. Desplegar primero la función y migración en un entorno controlado, verificar rollback de identidad/incidencias y luego decidir habilitación.

## Open Questions

- Confirmar durante la implementación qué variante exacta de `supabase.auth.admin.generateLink` ofrece la CLI/SDK fijada y qué campos devuelve sin enviar correo. Si no cumple consumo único y expiración verificables, el Change debe permanecer bloqueado.
