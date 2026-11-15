# Spec Delta

## ADDED Requirements

### Requirement: La venta conserva el nombre de contraparte confirmado
Cada venta nueva SHALL conservar como snapshot el nombre de la contraparte mostrado al confirmar, además del UUID cuando sea cliente registrado, sin reescribir documentos históricos.

#### Scenario: Nombre de cliente registrado cambia después de la venta
- **WHEN** se cambia el nombre de un cliente registrado después de confirmar una venta nueva
- **THEN** la venta y su recibo conservan el nombre snapshot confirmado junto con el UUID original.

#### Scenario: Venta ocasional sin identidad de cliente
- **WHEN** se confirma una venta al contado a un cliente ocasional
- **THEN** el documento conserva el nombre textual y carece de asociación a `clients`.

#### Scenario: Documento histórico anterior al snapshot
- **WHEN** se consulta una venta anterior que no tiene snapshot
- **THEN** permanece sin reescritura y conserva el mecanismo de lectura histórica existente.
