# Design — CHG-13

## Estado observado
En rama remota antigua, formulario de inventory tiene `KindCard` para `joya/piedra` y muestra campos heredados etiquetados con términos comerciales nuevos; `BarcodeLabel` imprime `Piedra ... ct`. Los selectores de `sales.tsx` y `purchases.tsx` dependen de inventario y deben contrastarse con el flujo RPC actual de la rama local.

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
