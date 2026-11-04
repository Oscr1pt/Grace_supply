# Proposal

## Why

La edición de clientes falla en Cloud porque el formulario reenvía la columna generada `rnc_normalized`, provocando PostgreSQL 428C9. Además, las nuevas altas deben exigir documentos válidos y resolver duplicados sin perder homónimos ni historial.

## What Changes

- Construir payloads de clientes con una lista explícita de campos editables.
- Mantener intactos UUID, timestamps y columnas generadas o administradas por el servidor.
- Exigir cédula/RNC válido para nuevas altas identificadas y conservar clientes históricos sin documento.
- Reforzar duplicados normalizados, advertencias de homónimos y confirmación explícita.
- Preservar formularios ante errores y diferenciar validación, conflicto, permisos y transporte.
- Añadir pruebas de UI, REST, concurrencia y RLS.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `client-identity-validation`: exige documento en nuevas altas identificadas, conserva históricos sin documento y define recuperación de errores CRUD.

## Impact

Afecta `clients.tsx`, `storage.ts`, validadores, pruebas de clientes y, si el preflight lo requiere, una migración forward-only para nuevas escrituras. No modifica clientes históricos, ventas, créditos ni Changes archivados.
