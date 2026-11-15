# Spec Delta

## ADDED Requirements

### Requirement: Ventas al contado con cliente ocasional
Una venta SHALL poder registrar una contraparte ocasional mediante un nombre capturado en el documento, sin crear una ficha de cliente ni asociarla por coincidencia de nombre; el servidor SHALL mantener la política financiera vigente.

#### Scenario: Venta al contado con cliente ocasional
- **WHEN** un usuario autorizado confirma una venta al contado con nombre ocasional válido
- **THEN** la operación conserva ese nombre en el documento, no crea una fila en `clients` y contabiliza líneas, ITBIS, inventario e idempotencia según los contratos vigentes.

#### Scenario: Nombre igual a un cliente registrado
- **WHEN** el nombre ocasional coincide con el de uno o más clientes registrados
- **THEN** la venta sigue sin `client_id` y no se vincula automáticamente con ninguno de ellos.

#### Scenario: Cliente ocasional intenta comprar a crédito
- **WHEN** se envía una venta a crédito sin UUID de un cliente activo
- **THEN** PostgreSQL rechaza la operación completa y no crea venta, crédito ni movimientos de inventario.

#### Scenario: Falta el nombre ocasional
- **WHEN** se solicita venta ocasional con nombre vacío después de recortar espacios
- **THEN** la operación se rechaza antes de cualquier efecto persistido.
