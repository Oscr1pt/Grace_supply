# Proposal — Persistencia confirmada y errores visibles

## Why

storage.ts ignora errores de respuesta de Supabase y modifica estado/cache como si la escritura hubiera persistido; ajustes y equipo anuncian éxito sin esperar. Se necesita un contrato uniforme que impida confirmaciones fantasma.

## What Changes

- Definir resultado confirmado, error e incierto por operación, con comprobación de filas afectadas.
- Adaptar consumidores para esperar confirmación y conservar entradas recuperables ante error.
- Probar denegación RLS, cero filas, fallos de servicio, desconexión y resultados inciertos con fixtures sintéticas.

## Capabilities

### New Capabilities

- verified-persistence: persistencia confirmada y errores visibles.

### Modified Capabilities

Ninguna.

## Impact

storage, settings, auth, rutas de ventas/compras/equipo y componentes que anuncian éxito tras escritura.

## Acceptance

Solo una escritura confirmada produce estado de éxito. Las pruebas usan Supabase local o un proyecto aislado; no requieren datos históricos de prueba.

## Dependencies

Se ejecuta después del baseline coordinado CHG-03/06 y requiere CHG-00. CHG-07 es dueño de atomicidad e idempotencia compuesta; CHG-04 cambia el transporte de identidad.

## Constraints

No convertir almacenamiento local en confirmación remota. Implementar sobre el esquema local versionado por CHG-03/06; no ejecutar migraciones en Cloud ni modificar el proyecto anterior. No agregar autenticación ni políticas RLS fuera de alcance; documentar las pruebas dependientes de CHG-04/05.

## Validation

Ejecutar TypeScript, build, pruebas automatizadas y `openspec validate chg-01-durable-persistence-errors --strict`. Priorizar Supabase local; si no está disponible, usar fixtures aislados y documentar qué pruebas de backend quedan pendientes.

