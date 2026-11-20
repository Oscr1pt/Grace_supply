# Proposal

## Why

El recibo interno actual ya presenta la información comercial y los importes confirmados, pero no explica la política aprobada de cambios y devoluciones. Incluirla al pie reduce ambigüedades para el cliente sin convertir el documento en comprobante fiscal ni modificar el registro de venta.

## What Changes

- Añadir al recibo un pie compacto con el agradecimiento y el texto exacto aprobado de cambios y devoluciones.
- Mantener la identificación `RECIBO INTERNO — NO ES COMPROBANTE FISCAL`.
- Mostrar la política solo en ventas cuya fecha `createdAt` sea igual o posterior al instante de entrada en vigor establecido para la publicación; las ventas anteriores no reciben condiciones retroactivas.
- Ajustar la impresión del recibo para mantener el contenido completo en vista previa A4 y anchos reducidos, sin fijar un tamaño de papel.
- Añadir pruebas para contenido, orden, vigencia, importes, ventas anuladas, historial y salida de impresión.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `safe-sales-purchases-ui`: define el contenido del pie comercial del recibo, su vigencia y su presentación impresa, conservando la identificación interna y los importes históricos.

## Impact

- UI: `ReceiptDialog` en `src/routes/_app/sales.tsx` y estilos de impresión en `src/styles.css`.
- Pruebas: pruebas de navegador existentes o nuevas para recibos en historial, anulados y vista de impresión.
- No se modifican ventas, recibos almacenados, esquema, RPC, impuestos, autenticación, permisos ni operaciones financieras.
- La vigencia se basa en `Sale.createdAt` y un instante fijo del despliegue, sin migración ni backfill. Ese instante debe quedar alineado con la entrada en vigor antes de publicar.
