# Spec Delta — authorized-inventory-adjustments

## Purpose

Permitir ajustes manuales de existencia autorizados, atómicos y auditables, sin alterar el modelo financiero o los controles de stock existentes.

## ADDED Requirements

### Requirement: Ajuste de stock mediante UI separada y autoridad del servidor
La aplicación SHALL ofrecer una operación «Ajustar existencia» a actores con permiso `inventory` efectivo, mostrando producto, existencia confirmada, objetivo, delta y motivo antes de enviar. La modificación SHALL ejecutarse exclusivamente por la RPC `adjust_inventory`; el formulario de producto MUST NOT escribir directamente `quantity`.

#### Scenario: Ajuste positivo desde inventario
- **WHEN** un actor autorizado confirma cantidad objetivo mayor a la existencia mostrada y motivo válido
- **THEN** el servidor contabiliza exactamente un delta positivo y la interfaz muestra la existencia confirmada, sin registrar una compra ficticia.

#### Scenario: Ajuste negativo por conteo
- **WHEN** un actor autorizado corrige el conteo a una cantidad inferior pero no negativa
- **THEN** la operación reduce la existencia y registra el motivo y el cambio confirmado.

#### Scenario: Faltan permisos
- **WHEN** un anónimo o usuario sin permiso `inventory` intenta invocar la RPC o modificar `quantity` directamente
- **THEN** el servidor deniega la operación y la UI no presenta un éxito aparente.

### Requirement: Consistencia bajo concurrencia e idempotencia
Todo ajuste SHALL validar `expected_quantity`, `delta` entero distinto de cero, motivo y stock final no negativo del lado servidor. Una intención SHALL usar una clave de idempotencia estable y permitir recuperar el resultado sin reejecutar movimientos ante timeout.

#### Scenario: Existencia cambió mientras se confirmaba
- **WHEN** el stock vigente difiere de `expected_quantity`
- **THEN** el servidor rechaza con conflicto recuperable, muestra cantidad actualizada y exige nueva confirmación sin recalcular/aplicar silenciosamente el ajuste.

#### Scenario: Doble clic o timeout
- **WHEN** el usuario reenvía la misma intención confirmada por doble clic o respuesta perdida
- **THEN** persiste exactamente un ajuste y su resultado canónico se recupera mediante la misma clave/identidad.

#### Scenario: Delta excesivo o negativo inválido
- **WHEN** la corrección solicita una existencia final negativa o un delta inválido
- **THEN** el servidor rechaza toda la operación sin actualizar inventario ni emitir auditoría de éxito.

### Requirement: Evidencia auditable del ajuste
Cada ajuste confirmado SHALL persistir identidad del operador, fecha, producto, cantidad anterior, nueva cantidad, delta y motivo no vacío. La evidencia MUST asociarse a la operación idempotente y limitarse a lectores autorizados según RLS existente.

#### Scenario: Ajuste confirmado
- **WHEN** el servidor finaliza un ajuste válido
- **THEN** existe un único evento auditable para el `operation_id`, con motivo y delta del ajuste, sin modificar documentos comerciales anteriores.

#### Scenario: Consulta sin permiso sobre historial
- **WHEN** un empleado sin autorización de auditoría intenta leer eventos históricos
- **THEN** el servidor los oculta o deniega conforme a la política existente, aun cuando tenga permiso operativo para ajustar inventario.

#### Scenario: Rechazo o error de red incierto
- **WHEN** se rechaza una corrección o el cliente desconoce si hubo commit
- **THEN** no se declara éxito sin confirmación; un rechazo no genera evento exitoso y una respuesta incierta se concilia sin segundo movimiento.
