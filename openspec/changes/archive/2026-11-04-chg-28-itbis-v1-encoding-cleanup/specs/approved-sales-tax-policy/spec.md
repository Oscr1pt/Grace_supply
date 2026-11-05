# Spec Delta

## MODIFIED Requirements

### Requirement: Configuración tributaria administrable y pendiente por defecto
La aplicación MUST ofrecer junto a los ajustes generales un único interruptor «Aplicar ITBIS» y una tasa V1 inicialmente 18%. Guardar ajustes MUST persistir la configuración operativa válida sin una segunda confirmación de pantalla, manteniendo el control administrativo del servidor.

#### Scenario: Se guarda la propuesta del 18%
- **WHEN** un administrador guarda la tasa V1 y el interruptor sin autorización tributaria comercial
- **THEN** PostgreSQL conserva la configuración operativa, registra el actor y mantiene separada la habilitación comercial de Cloud.

## ADDED Requirements

### Requirement: Política V1 soportada como condición de venta
La aplicación MUST permitir ventas con impuesto desactivado bajo una configuración V1 válida, o con 18% activado para `gravado`; `exento` queda en cero y `pendiente` falla cerrado cuando el modo activado requiere clasificación.

#### Scenario: ITBIS desactivado
- **WHEN** existe una configuración V1 válida con el interruptor desactivado
- **THEN** `sales_posting_status` y `post_sale` permiten la venta sin agregar impuesto.

#### Scenario: ITBIS activado
- **WHEN** un administrador guarda el modo activado y una venta contiene productos gravados y exentos
- **THEN** PostgreSQL calcula 18% solo sobre gravados y conserva subtotal, impuesto, total y snapshots.

#### Scenario: Tasa no soportada
- **WHEN** se intenta guardar una tasa distinta de la modalidad V1 soportada
- **THEN** la operación es rechazada sin cambiar la configuración efectiva ni habilitar ventas.

### Requirement: Aprobación comercial separada de la configuración operativa
La aplicación MUST conservar la auditoría y los controles de servidor sin presentar la configuración V1 como certificación DGII ni como aprobación tributaria legal del negocio.

#### Scenario: Recibo V1
- **WHEN** se confirma una venta local bajo una configuración soportada
- **THEN** el recibo muestra «RECIBO INTERNO — NO ES COMPROBANTE FISCAL» y no genera NCF/e-CF.

#### Scenario: Habilitación comercial pendiente
- **WHEN** falta la aprobación tributaria formal del propietario y asesor
- **THEN** la evidencia sintética se conserva como QA técnico y no autoriza Cloud ni cobro comercial de ITBIS.
