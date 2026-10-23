# Proposal — Auditoría financiera y anulación controlada

## Why

Ventas y compras se eliminan físicamente y algunos datos de auditoría dependen del cliente. Se requiere trazabilidad verificable para operaciones reales futuras y correcciones compensatorias.

## What Changes

- Registrar cada operación futura en la misma transacción con actor Auth y tiempo de servidor.
- Reemplazar DELETE de documentos reales por anulaciones autorizadas, motivadas e idempotentes.
- Probar permisos, compensaciones y conciliación con fixtures; no importar transacciones ficticias.

## Capabilities

### New Capabilities

- financial-evidence-preservation: auditoría financiera y anulación controlada.

### Modified Capabilities

Ninguna.

## Impact

Documentos financieros, funciones CHG-07, permisos CHG-05, migraciones CHG-03 e informes.

## Acceptance

Las operaciones reales futuras conservan originales, actor y eventos; anulaciones no duplican ni desbalancean efectos. No se fabrica historia desde filas de prueba.

## Dependencies

Requiere CHG-07 y sus dependencias CHG-03/04/05/06.

## Constraints

No se ejecuta ninguna migración ni operación Supabase en esta actualización.

## Validation

Revisión manual de consistencia solamente. OpenSpec CLI no está disponible en este entorno, por lo que esta propuesta no está oficialmente validada; ejecutar `openspec validate chg-08-financial-audit-annulment --strict` antes de implementar.

