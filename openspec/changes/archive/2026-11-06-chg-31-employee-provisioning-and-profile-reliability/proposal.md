# Proposal

## Why

La gestión de empleados permanece bloqueada en instalaciones donde el correo transaccional y las URL de redirección no están verificados, y la edición de nombre o teléfono puede terminar en un estado «no confirmado» aunque el servidor haya persistido el cambio. CHG-31 hará explícitos esos prerrequisitos y convertirá la confirmación de invitaciones y perfiles en un flujo reconciliable, sin rebajar los controles de identidad, permisos o RLS.

## What Changes

- Diagnosticar y endurecer el aprovisionamiento administrativo de empleados, incluyendo flags de entorno, SMTP/Mailpit, origen público, redirects, confirmación de correo, contraseña inicial, activación y compensación Auth/perfil.
- Mantener las invitaciones cerradas cuando falte configuración verificable y mostrar el motivo operativo exacto; no habilitar registro público ni creación de administradores sin autorización.
- Reconciliar actualizaciones de nombre y teléfono mediante la respuesta persistida y una lectura confirmatoria por identidad, distinguiendo éxito, error definitivo y resultado incierto sin reintentos duplicados.
- Exponer estados accesibles y en español para guardado, invitación, correo pendiente, activación, cuenta activa, validación, permisos y resultados no confirmados.
- Añadir pruebas de Edge Functions, Auth/RLS, compensación, reconciliación, permisos, Mailpit y navegador sobre un stack local desechable.

## Capabilities

### New Capabilities

<!-- No se introduce una capacidad independiente; se fortalecen contratos existentes. -->

### Modified Capabilities

- `account-access-usability`: las invitaciones, activación y estados visibles deben reflejar prerrequisitos y confirmaciones reales del servidor.
- `secure-user-creation-editing`: las operaciones de aprovisionamiento y edición deben reconciliar persistencia incierta y conservar controles de identidad, permisos y compensación.

## Impact

- Frontend: `src/routes/_app/team.tsx`, `src/lib/auth.tsx` y mensajes/estados de gestión de empleados.
- Edge Functions: `supabase/functions/manage-profile/index.ts` y `complete-initial-password/index.ts`, sin cambiar el registro público ni usar service-role desde el navegador.
- Pruebas de seguridad, integración y navegador; configuración local de SMTP/Mailpit, origen y redirects solo para entornos desechables.
- Posibles ajustes forward-only únicamente si la reconciliación o auditoría requiere una garantía que el esquema actual no ofrece; Cloud queda fuera de alcance.
