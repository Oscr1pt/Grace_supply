# Spec Delta

## ADDED Requirements

### Requirement: Anulación de compra multilínea compensa stock de forma indivisible
La anulación autorizada SHALL compensar en una sola transacción cada línea vinculada que fue repuesta por la compra, conservar el documento y rechazar la operación completa cuando una línea vinculada no tenga existencias suficientes. Las líneas manuales SHALL permanecer fuera de las compensaciones de inventario.

#### Scenario: Anular compra con varias líneas repuestas
- **WHEN** un administrador activo anula una compra multilínea sin pagos de crédito vigentes y todas las existencias permiten revertir las cantidades
- **THEN** se marca un único documento como anulado, se reduce cada producto por su cantidad repuesta y se registra una sola compensación auditable.

#### Scenario: Stock insuficiente en una de varias líneas
- **WHEN** una línea repuesta no tiene stock suficiente al anular
- **THEN** se rechaza la anulación completa y ninguna existencia, crédito o estado del documento cambia.

#### Scenario: Compra multilínea sin reposición
- **WHEN** se anula una compra cuyas líneas no repusieron inventario
- **THEN** no se modifica inventario y se conserva el flujo existente de crédito y compensación.

#### Scenario: Anular compra manual o mixta
- **WHEN** se anula una compra con líneas manuales y, opcionalmente, líneas vinculadas repuestas
- **THEN** ninguna línea manual modifica existencias y solo se revierten las cantidades repuestas de líneas vinculadas, en la misma compensación atómica.

#### Scenario: Reintento de anulación
- **WHEN** se repite la misma anulación confirmada con su clave idempotente
- **THEN** se devuelve el resultado persistido sin descontar existencias ni duplicar compensaciones.
