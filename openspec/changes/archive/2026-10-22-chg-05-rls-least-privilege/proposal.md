# Proposal — Autorización de base de datos con mínimo privilegio

## Why

Los SQL locales declaran políticas permisivas y las rutas basan permisos en estado del navegador. La autorización efectiva debe residir en PostgreSQL y mecanismos de servidor confiables.

## What Changes

- Definir matriz explícita de filas y operaciones por rol, módulo y estado.
- Denegar por defecto acceso anónimo a datos privados y limitar grants, RLS, vistas y RPC.
- Probar acceso directo con cuentas sintéticas y habilitar coordinadamente con CHG-04.
- Mantener privilegios mínimos por recurso/operación; no conceder acceso general a tablas ni incluir claves privilegiadas en el frontend.

## Capabilities

### New Capabilities

- database-authorization: autorización de base de datos con mínimo privilegio.

### Modified Capabilities

Ninguna.

## Impact

Tablas actuales y futuras, vistas, funciones, perfiles y permisos Auth de CHG-04.

## Acceptance

Anon y usuarios revocados no leen ni modifican datos privados; empleados se limitan a sus permisos vigentes; no hay bypass mediante REST/RPC ni payloads alterados.

## Dependencies

CHG-00, baseline coordinado CHG-03/06 y contrato de persistencia implementado en CHG-01. La aceptación de CHG-01 para persistencia autorizada real queda pendiente hasta completar CHG-04 y esta Change; ambas Changes conservan artefactos, implementación y validación separados, y se prueban/habilitan juntas antes de abrir datos privados. CHG-05 habilita las operaciones de CHG-07.

## Constraints

Pruebas en Supabase local o entorno aislado con cuentas y datos sintéticos. No se aplican políticas remotas en esta actualización.

## Validation

Revisión manual de consistencia solamente. OpenSpec CLI no está disponible en este entorno, por lo que esta propuesta no está oficialmente validada; ejecutar `openspec validate chg-05-rls-least-privilege --strict` antes de implementar.

