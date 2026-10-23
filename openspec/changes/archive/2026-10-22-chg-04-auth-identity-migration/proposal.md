# Proposal — Identidad verificada con Supabase Auth

## Why

El cliente actual compara contraseñas en public.users, restaura una sesión local y permite auto-registro admin. Se conservará el acceso visible con username y password, mientras Supabase Auth valida la contraseña y una identidad individual respalda los permisos.

## What Changes

- Reemplazar el mecanismo heredado por perfiles vinculados a auth.users; no importar cuentas ni contraseñas ficticias.
- Resolver username a identidad Auth mediante servidor confiable, con protección contra enumeración y abuso.
- Asociar cada identidad a un correo individual, unico y verificado bajo control del empleado; el alta administrativa usa la invitacion oficial de Supabase Auth.
- Implementar recuperacion y cambio de contrasena mediante el flujo oficial de Supabase Auth, sin revelar el correo vinculado.

## Capabilities

### New Capabilities

- verified-user-identity: identidad verificada con Supabase Auth.

### Modified Capabilities

Ninguna.

## Impact

Login, sesiones, perfiles, roles, administración de cuentas y coordinación con CHG-05.

## Acceptance

Auth verifica password, username es unico, los perfiles no contienen contrasenas, las cuentas revocadas pierden acceso y la recuperacion llega al correo individual verificado sin revelar su direccion. Recovery y provisioning en Cloud siguen apagados hasta verificar SMTP transaccional y URLs.

## Dependencies

CHG-00, baseline CHG-03/06 y contrato de persistencia implementado en CHG-01. La aceptación de CHG-01 para persistencia autorizada real queda pendiente hasta completar esta Change y CHG-05; ambas Changes conservan artefactos, implementación y validación separados, y se prueban/habilitan juntas antes de abrir datos privados.

## Constraints

Crear cuentas sinteticas nuevas. La titularidad del correo individual esta aprobada; cualquier empleado sin correo individual queda como excepcion pendiente, sin mecanismo alternativo implementado.

## Validation

OpenSpec strict validation passed on 2026-10-22 for chg-04-auth-identity-migration.

