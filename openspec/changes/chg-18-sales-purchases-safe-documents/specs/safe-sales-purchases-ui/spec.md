# Spec Delta — safe-sales-purchases-ui

## Purpose
Ventas, compras y documentos sin ambigüedad. Asegurar experiencia confiable conservando las invariantes existentes de autenticación, RLS y operaciones financieras.

## ADDED Requirements

### Requirement: Reglas de negocio visibles antes de contabilizar
La UI SHALL comunicar restricciones conocidas de venta y disponibilidad, conservando la autorización final de PostgreSQL.

#### Scenario: La política tributaria está sin aprobar
- **WHEN** la política tributaria está sin aprobar
- **THEN** el usuario conoce el bloqueo antes del intento y ninguna acción UI permite contabilizar la venta.

### Requirement: Documento y recibo consistentes
La selección y visualización MUST respetar UUID, snapshots de líneas, importes y stock confirmado sin reescribir documentos históricos.

#### Scenario: Cambia el precio de un artículo tras emitir un recibo
- **WHEN** cambia el precio de un artículo tras emitir un recibo
- **THEN** el recibo previo conserva sus líneas e importes confirmados.

### Requirement: Reconciliación y anulación confiables
Los botones SHALL impedir duplicación accidental y requerir motivo para anular por operaciones idempotentes.

#### Scenario: Se pierde respuesta de una compra enviada
- **WHEN** se pierde respuesta de una compra enviada
- **THEN** el formulario conserva clave e información, permite consultar resultado y no vuelve a contabilizar a ciegas.
