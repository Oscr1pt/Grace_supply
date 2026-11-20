# Spec Delta

## MODIFIED Requirements

### Requirement: Documento y recibo consistentes

La selección y visualización MUST respetar UUID, snapshots de líneas, importes y stock confirmado sin reescribir documentos históricos. Los recibos internos MUST conservar la identificación no fiscal y mostrar la política comercial aprobada únicamente en ventas cuya fecha sea igual o posterior al instante de entrada en vigor establecido para su publicación.

#### Scenario: Cambia el precio de un artículo tras emitir un recibo

- **WHEN** cambia el precio de un artículo tras emitir un recibo
- **THEN** el recibo previo conserva sus líneas e importes confirmados.

#### Scenario: Venta posterior a la vigencia de la política

- **WHEN** se consulta o imprime una venta con `createdAt` igual o posterior al instante de vigencia
- **THEN** después del total aparece una sola vez «¡GRACIAS POR SU COMPRA!» y «POLÍTICA DE CAMBIOS Y DEVOLUCIONES», seguido exactamente por estos párrafos y en este orden: «No realizamos devoluciones de dinero por cambios de opinión.»; «Los cambios por otros productos pueden solicitarse dentro de los 15 días posteriores a la compra, presentando el recibo y el producto en buen estado.»; «Verifique sus productos antes de retirarse del establecimiento.»; «Esta política no limita las garantías ni los derechos del consumidor establecidos por la ley.» El recibo conserva «RECIBO INTERNO — NO ES COMPROBANTE FISCAL» y los importes confirmados.

#### Scenario: Reimpresión de una venta anterior a la vigencia

- **WHEN** se consulta o imprime una venta con `createdAt` anterior al instante de vigencia
- **THEN** el recibo conserva su contenido comercial histórico y no muestra la nueva política ni reescribe datos almacenados.

#### Scenario: Venta anulada posterior a la vigencia

- **WHEN** se consulta o imprime una venta posterior a la vigencia que fue anulada
- **THEN** se conserva el indicador y motivo de anulación junto con sus importes, y la política aparece una sola vez después del total.

#### Scenario: Vista de impresión en papel amplio o estrecho

- **WHEN** se previsualiza o imprime un recibo con la política en papel A4 o en un ancho reducido soportado por el navegador
- **THEN** el pie completo permanece legible después del total, no se corta entre páginas ni desborda, y no se impone un tamaño de papel.

#### Scenario: Recibo cargado desde el historial

- **WHEN** se abre desde el historial una venta anterior o posterior al instante de vigencia
- **THEN** el diálogo respeta la fecha de la venta, muestra u omite la política según corresponda y sus acciones de cerrar e imprimir siguen funcionando.
