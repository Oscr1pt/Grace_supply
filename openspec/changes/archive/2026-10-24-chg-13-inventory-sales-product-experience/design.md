# Design — CHG-13

## Estado observado
En la rama local vigente, `src/routes/_app/inventory.tsx` conserva `ItemKind = joya|piedra` y columnas heredadas; presenta etiquetas adaptadas para insumos, marca y presentación. `BarcodeLabel` todavía puede imprimir `Piedra ... ct` o datos de metal/quilates según el registro. Esas referencias requieren el contrato de CHG-12 y se actualizarán en CHG-13, sin reescribir el esquema en esta Change.

Las rutas locales de ventas y compras ya llaman `postBusinessOperation`; los RPC aplican transacciones e idempotencia y conservan snapshots financieros. Auditoría y anulaciones append-only vienen de CHG-08. El RPC de venta rechaza operaciones mientras `tax_policy_approved` o la regla de redondeo estén pendientes, y el cliente traduce el rechazo en bloqueo tributario. CHG-13 debe mantener este flujo y probar contra él, no sustituirlo por escrituras directas.

## Decisiones de UX
- Formulario: SKU, nombre, descripción, categoría creable, marca, presentación/unidad, costo, precio, atributos opcionales y estado. No exigir material, quilates, gema, corte ni claridad; no inventar stock inicial mediante update directo.
- Catálogo vacío muestra llamada a crear primer producto sin datos de ejemplo guardados.
- Búsqueda por SKU, nombre, categoría y marca; validaciones y mensajes en español; manejo correcto de error/permiso, guardado confirmado y carga.
- Etiquetas: negocio, nombre, variante/presentación opcional, SKU, código de barras y precio opcional. Sin `ct` ni identificadores de joyería.
- Ventas/compras: selector usa producto vigente con UUID, SKU, nombre, precio confirmado y stock disponible; preservar snapshot de descripción/precio de documento y prohibir duplicación/venta sin impuestos aprobados.
- Borrado de productos con referencias históricas: preferir desactivación/ocultamiento, sin DELETE destructivo. Proteger auditoría.
- Considerar responsividad escritorio/tablet, contraste y navegación con teclado.

## Verificación
Pruebas navegador para catálogo vacío, alta y edición, categoría personalizada, búsquedas, etiqueta/barcode, venta bloqueada sin política fiscal, compras y controles de stock, perfiles sin permiso, fallos de persistencia y cambio de sesión.
