# Proposal

## Why

Grace Supply necesita dar de alta a los primeros empleados de un equipo pequeño sin depender de SMTP ni de invitaciones automáticas por correo. El flujo actual mantiene dos caminos de aprovisionamiento (`invite_employee` y `create_user`) con garantías distintas, lo que dificulta la operación y deja una discrepancia entre la configuración inicial de contraseña y la activación.

## What Changes

- Introducir un único flujo de alta administrativa basado en `create_user`, con perfil inactivo y `password_change_required=true`.
- Generar un enlace seguro, de un solo uso y con expiración para `/setup-account`, entregable una sola vez al administrador, sin persistir enlaces, tokens ni contraseñas.
- Retirar de la interfaz el camino operativo `invite_employee` y conservar sus controles server-side solo mientras exista compatibilidad o migración segura.
- Mantener la identidad individual de Supabase Auth, el correo como identificador y la verificación administrativa antes de compartir el enlace.
- Exigir configuración de contraseña mediante `complete-initial-password` antes de activar la cuenta.
- Rechazar enlaces vencidos o reutilizados, duplicados y activaciones prematuras; conservar compensación de identidades parciales, RLS y protección del último administrador.
- Investigar y corregir, dentro del mismo flujo, la confirmación E2E de edición de perfil que actualmente puede informar un resultado no confirmado después de activar una cuenta.

## Capabilities

### New Capabilities

- Ninguna. El comportamiento se incorpora a capacidades existentes de acceso y aprovisionamiento.

### Modified Capabilities

- `account-access-usability`: sustituir la invitación dependiente de correo por un alta administrada con entrega manual controlada del enlace y estados verificables.
- `secure-user-creation-editing`: hacer único el flujo de creación, exigir contraseña inicial server-side y conservar reconciliación, compensación y protección de activación.

## Impact

- Frontend: `TeamCreateUserPage`, `team.tsx`, `SetupAccountPage`, `auth.tsx` y navegación de rutas.
- Edge Functions: `manage-profile` y `complete-initial-password`; posible eliminación controlada del uso de `invite_employee`.
- Auth/PostgreSQL: metadatos de enlaces de alta, expiración/reutilización, `password_change_required`, incidencias de aprovisionamiento y auditoría.
- Pruebas: Auth/RLS, Mailpit/local links, Playwright de alta, activación, login, edición y revocación.
- No incluye cambios Cloud, despliegues, migraciones históricas ni registro público.
