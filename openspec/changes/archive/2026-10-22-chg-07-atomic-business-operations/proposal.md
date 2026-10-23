# Proposal — Operaciones de negocio atómicas e idempotentes

## Why

Ventas, compras y abonos realizan varias escrituras independientes con stock/saldos calculados en navegador. Persistir cada escritura no evita estados parciales, concurrencia o duplicación.

## What Changes

- Sustituir secuencias del cliente por operaciones transaccionales de servidor/RPC con identidad y permisos verificados.
- Calcular importes en servidor, bloquear filas compartidas y registrar claves de idempotencia durables.
- Probar concurrencia, reintentos y fallos con fixtures sintéticas.

## Capabilities

### New Capabilities

- atomic-business-posting: operaciones de negocio atómicas e idempotentes.

### Modified Capabilities

Ninguna.

## Impact

Flujos de venta, compra, crédito, pago e inventario; contratos CHG-01/04/05/06 y futuras funciones PostgreSQL.

## Acceptance

Cada operación confirma todos sus efectos o ninguno; stock/saldos no son negativos; reintentos no duplican efectos.

## Dependencies

Requiere CHG-01, CHG-06 y CHG-04/05 coordinados. CHG-08 añade auditoría y compensaciones.

## Constraints

Las pruebas usan Supabase local o entorno aislado. La integración con DGII/e-CF queda fuera de alcance. Precios, impuestos y redondeo que dependan de reglas del negocio siguen pendientes de confirmación; no se inferirán requisitos fiscales.

## Validation

Revisión manual de consistencia solamente. OpenSpec CLI no está disponible en este entorno, por lo que esta propuesta no está oficialmente validada; ejecutar `openspec validate chg-07-atomic-business-operations --strict` antes de implementar.

