# Design

## Context

El panel de empleados oculta el formulario cuando `VITE_ACCOUNT_PROVISIONING_ENABLED` no está activo, mientras `manage-profile` también exige `ACCOUNT_PROVISIONING_ENABLED`, un origen permitido y una URL de redirección válida. La invitación crea Auth y perfil en pasos separados y ya dispone de compensación e incidencias. Las actualizaciones de perfil se validan con `requireConfirmedEmployeeProfile`, pero el editor puede presentar resultado no confirmado si falla la respuesta o la lectura posterior.

## Goals / Non-Goals

**Goals:**

- Mantener el aprovisionamiento cerrado hasta verificar SMTP/Mailpit, origen público, redirects y las cuatro Edge Functions requeridas.
- Hacer que invitación, activación y edición distingan estados confirmados, errores definitivos y resultados inciertos.
- Reconciliar por identidad y valores persistidos sin duplicar invitaciones, cambios de perfil ni elevaciones de rol.
- Preservar Auth, RLS, protección del último administrador, compensación de identidades y ausencia de secretos en frontend/logs.

**Non-Goals:**

- No habilitar registro público, autoaprovisionamiento ni creación de administradores desde el navegador.
- No desplegar Edge Functions, cambiar Cloud, ejecutar `db push` ni modificar migraciones históricas.
- No introducir una cola general de reintentos ni cambiar contratos financieros.

## Decisions

1. **Prerrequisitos verificados en servidor.** `manage-profile` seguirá siendo la autoridad para invitación y activación. La UI podrá ocultar o mostrar el formulario según una capacidad de entorno, pero una invitación solo se considera habilitada cuando la función valida flags, origen, redirect y correo transaccional. Se prefiere fallar cerrado y mostrar un diagnóstico seguro antes que habilitar por un flag de Vite.

2. **Confirmación por identidad y lectura.** `updateEmployee` exigirá una respuesta con el perfil esperado y realizará `refreshUsers`; el resultado confirmado se comparará por `auth_user_id`/username y por los campos solicitados. Si la escritura pudo ocurrir pero la lectura no confirma, se conservará un estado incierto y el borrador, sin segundo envío automático. Esto evita convertir un timeout en un rechazo falso o duplicar una operación sensible.

3. **Estados explícitos compartidos.** Team y `EmployeeContactEditor` usarán el estado de la operación existente (`idle`, `pending`, `confirmed`, `denied`, `uncertain`, `failed`) para mensajes en español y `aria-live`. Los estados de cuenta se derivarán de señales autorizadas: perfil activo, correo confirmado, contraseña inicial pendiente e incidencia abierta.

4. **Compensación conservada.** Las invitaciones seguirán creando Auth y perfil de forma separada. Si falla el perfil se elimina la identidad; si falla la limpieza se registra `provisioning_incidents` y se bloquea activación. No se usará service-role desde el navegador ni se ocultarán incidencias.

5. **Configuración local aislada para pruebas.** Las pruebas usarán un stack Supabase local desechable, Mailpit y `supabase functions serve --env-file` cuando sea necesario. Se probarán `manage-profile`, `username-login`, `username-recovery` y `complete-initial-password` con variables sintéticas; Cloud y sus redirects permanecen fuera del cambio.

## Risks / Trade-offs

- **[SMTP u origen no configurados]** → el flujo seguirá bloqueado y mostrará el prerrequisito faltante; se documentará la configuración requerida sin simular entrega.
- **[Respuesta perdida después de persistir]** → lectura por identidad y estado incierto; no se reintenta con una clave o invitación nueva.
- **[Auth y perfil divergen]** → compensación existente e incidencia administrativa bloqueante; pruebas de fallo parcial cubrirán ambos caminos.
- **[La lectura de perfiles falla tras actualizar]** → conservar el formulario y mostrar error de servicio, sin reemplazar valores confirmados por datos locales.
- **[Configuración de entorno distinta entre Vite y Edge Runtime]** → preflight comprobará variables dentro del proceso Edge y rechazará ejecuciones contra Cloud.

## Migration Plan

1. Verificar localmente funciones, variables, Mailpit, redirects y permisos con usuarios sintéticos.
2. Implementar reconciliación y estados sin ejecutar migraciones; solo preparar una migración forward-only si una garantía de auditoría no existe en el esquema actual.
3. Ejecutar pruebas focalizadas, Auth/RLS, integración y Playwright; conservar el flujo bloqueado si falla un prerrequisito.
4. Para rollback local, revertir el cambio de frontend/Edge en el checkout y descartar únicamente fixtures sintéticos. No aplicar nada en Cloud durante CHG-31.

## Open Questions

- La habilitación de invitaciones en Cloud queda pendiente de confirmar SMTP transaccional, `APP_PUBLIC_ORIGIN`/`APP_ALLOWED_ORIGINS` y redirects exactos del proyecto; esa decisión no cambia el diseño seguro ni autoriza despliegue.
