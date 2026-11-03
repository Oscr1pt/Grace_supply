# Design — CHG-22: Alta y edición segura de usuarios

## Evidencia en el repositorio (2026-11-02)

- `/team` incluye invitación inline con username, nombre y correo y administra rol, permisos, activación y revocación. `src/lib/auth.tsx` deriva `users` de `user_profiles`.
- `manage-profile` valida el token Auth y exige `role='admin'` y `active=true`. El comando `invite_employee` crea exclusivamente un empleado inactivo, usa `inviteUserByEmail`, compensa fallos de perfil y requiere flag de servidor. `update` ya permite nombre, rol y permisos, pero no teléfono.
- La tabla `user_profiles` tiene username único normalizado, name, role, permissions, active y auth_user_id único; **sin teléfono**. Trigger existente exige Auth email confirmado antes de activar; otro protege al último admin activo. Sin registro público.
- `/reset-password` cubre invitaciones y recuperación, incluida limpieza de sesión temporal y retorno a login corregidos en FIX-01. El nuevo onboarding no debe reintroducir esos bugs.

## D1 — Pantalla dedicada y navegación (tarea 1.1)

- Botón «Crear usuario» en `/team` -> ruta protegida `/team/new`, con retorno al listado sin pérdida indebida de estado. Campos: nombre, username normalizado, teléfono, correo individual, rol y contraseña inicial/confirmación, como solicita la operación administrativa. Clarificar que **el correo también es obligatorio para Auth y recuperación**.
- Validar duplicados de username normalizado y correo sin mostrar listas de identidades privadas; teléfono internacional o RD en formato compatible claramente definido, con normalización estable. Incluir show/hide password accesible y reglas de complejidad equivalentes o más fuertes que el reset existente.
- Separar **configuración inicial de cuenta** de `/reset-password` mediante ruta `/setup-account` (u otra ruta explícita). Seguir procesando solo callbacks Auth válidos, enlaces vencidos/consumidos y sesión transitoria; navegación y salida limpian la sesión. No duplicar toda la lógica, extraer helper limitado si hace falta.
- UI presenta los estados «perfil creado inactivo», «identidad/correo aún sin verificar» y «activación confirmada» **solo si el servidor los acredita**. Evitar «correo entregado» si solo se aceptó una solicitud.

## D2 — Operación de servidor, contraseña, perfil y edición (tarea 2.1)

- Diseñar y documentar primero el ciclo de la **contraseña inicial introducida por administrador**: canal autenticado HTTPS, uso exclusivo en Supabase Auth Admin y eliminación en memoria de formulario tras resultado definitivo; nunca en Postgres, trazas, errores, logs, almacenamiento, telemetría o respuestas.
- Exigir que la identidad nueva tenga correo propio confirmado antes de activar; si se pretende contraseña temporal con cambio forzoso, esa obligación se debe imponer **del lado de servidor**, no solamente mediante una redirección visual. Si no es posible mantener esta garantía con la arquitectura actual, no simularla: explicar el bloqueo y proponer mecanismo seguro de invitación con contraseña elegida por el usuario, sin dar por implementado el campo de contraseña administrativa.
- Crear una acción administrativa distinta o explícitamente acotada de `manage-profile` (por ejemplo `create_user`) con verificación actual de admin activo, validación server-side de nombre/username/teléfono/email/rol y password, y comprobación de colisiones. Confirmación explícita para rol admin y barrera contra escalamiento/autoedición. Preservar la política existente que `invite_employee` no permite admin.
- Persistencia dual Auth/perfil: cuenta nace **inactiva**; ante falla de persistencia del perfil, compensar identidad Auth o abrir incidencia bloqueante reutilizando `provisioning_incidents`; no anunciar éxito parcial ni crear duplicados en reintento. Minimizar exposición de correos y no generar usuarios ficticios.
- Migración versionada para `phone` y permisos de lectura solo para admins autorizados, con RLS/column grants expresos; asegurar que empleados no puedan leer teléfonos ajenos mediante REST, vistas o RPC. Actualizar los tipos TS, proyecciones y UI coherentes, sin grant general.
- Edición de nombre/teléfono/rol/permisos desde un formulario con confirmación para elevación/revocación, mensajes recuperables, estados pendientes y validación de respuesta. Nunca actualizar contraseña por SQL ni regresar password a UI. La edición de username solo si se hace con invariantes verificadas; en otro caso dejarlo bloqueado.

## D3 — QA proporcional (tarea 3.1)

- Preparar proyecto Supabase local **desechable y confirmado** antes de escrituras, con Edge Functions y Mailpit necesarios. Prohibido Cloud productivo, otros proyectos y registros reales. Ninguna habilitación de flags en Cloud.
- Probar: ruta admin vs employee, validación y duplicados username/email, formato de teléfono, creación employee/admin con autorización reforzada, ausencia de password en tablas/logs/respuestas, correo no confirmado/activación rechazada, confirmación real con Mailpit y alta completada, edición de nombre/teléfono/rol/permisos, último admin, reintentos simultáneos y fallo entre Auth y perfil/compensación.
- Probar configuración inicial separada de recuperación, links válidos/vencidos/reutilizados, salida a login FIX-01, rotación inicial si está exigida, denegación por RLS con tokens previos, reinicio/cambio de sesión, teclado, foco y tamaños 320/375/768/1280.
- Pruebas focalizadas de Auth/RLS y browser, `npm test`, TypeScript, ESLint pertinente, build, `git diff --check`, y `openspec validate chg-22-secure-user-creation-editing --strict`. Solo marcar 3/3 cuando el flujo elegido cumple el contrato real.

## Seguridad y alcance

Una interfaz nueva no puede modificar el modelo de seguridad por sí sola: el control está en Supabase Auth, Edge Function y RLS. No reutilizar el reset de contraseñas como una pantalla pública de aprovisionamiento ni permitir signup anónimo. Respetar feature flags y verificación de SMTP/orígenes, sin activar correo Cloud durante pruebas.

Sin refactor general de Auth ni cambios en CHG-18/19/21, FIX-01/02 ni archivos locales protegidos. No commit/push/merge/archive automáticamente en Apply.
