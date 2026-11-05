# Proposal

## Why

La aplicación publicada puede estar conectándose a un esquema de Supabase que aún no contiene los objetos de CHG-18/25/28. Además, la pantalla de Ajustes conserva un campo de tasa que contradice el alcance V1 fijo al 18%, lo que dificulta distinguir una configuración válida de una incompatibilidad de backend.

## What Changes

- Eliminar el input editable de tasa en Ajustes y conservar internamente la tasa V1 fija de 18%.
- Mantener únicamente el interruptor «Aplicar ITBIS» y «Guardar ajustes» para el cambio operativo autorizado.
- Traducir errores de funciones, vistas o columnas ausentes en un mensaje de actualización del servidor, sin confundirlos con falta de permisos.
- Mantener la autoridad PostgreSQL, auditoría del administrador, clasificación gravado/exento/pendiente, idempotencia, stock y recibos internos.
- Documentar y verificar, sin escribir en Cloud, la diferencia entre migraciones locales y el historial remoto, incluyendo un plan seguro de reconciliación.

## Capabilities

### New Capabilities

<!-- None. This change modifies an existing capability only. -->

### Modified Capabilities

- `approved-sales-tax-policy`: fija la tasa V1 en 18% en la interfaz y mejora la distinción entre backend desactualizado y autorización denegada.

## Impact

Afecta la pantalla y validación de Ajustes, el mapeo de errores de persistencia y las pruebas locales de configuración/ventas. La revisión de Cloud es solo de lectura; no aplica migraciones, no modifica cuentas ni cambia CHG-25/CHG-28 archivados.
