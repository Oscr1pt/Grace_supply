# Proposal — Esquema reproducible y versionado

## Why

El repositorio aporta dos SQL parciales y permisivos y no tiene una fuente completa del esquema. Se necesita construir el esquema de Grace Supply de forma limpia y reproducible, alineado con tipos y consultas.

## What Changes

- Definir contrato canónico de tablas, columnas, UUID, relaciones, funciones y defaults.
- Sustituir scripts manuales como fuente de instalación por migraciones ordenadas en supabase/migrations.
- Validar bootstrap desde base vacía con semillas sintéticas; no mapear ni migrar filas ficticias.

## Capabilities

### New Capabilities

- reproducible-database-schema: esquema reproducible y versionado.

### Modified Capabilities

Ninguna.

## Impact

supabase/migrations, tipos y consultas TypeScript, y contratos de CHG-04/05/06/07/08.

## Acceptance

Una base vacía alcanza el mismo esquema mediante la secuencia versionada y mantiene alineados SQL/TypeScript. Datos reales inesperados detienen cualquier transformación destructiva.

## Dependencies

Requiere CHG-00. El modelo de tablas, relaciones y constraints se diseña conjuntamente con CHG-06; CHG-03 es dueño de la secuencia y CHG-06 de las invariantes. CHG-05 controla autorización. Los SQL actuales quedan como referencia, no como ruta canónica.

## Constraints

No se diseña backfill de registros de prueba ni se ejecutan migraciones en esta actualización.

## Validation

Revisión manual de consistencia solamente. OpenSpec CLI no está disponible en este entorno, por lo que esta propuesta no está oficialmente validada; ejecutar `openspec validate chg-03-versioned-schema-migrations --strict` antes de implementar.

