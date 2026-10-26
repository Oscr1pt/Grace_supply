# Design — CHG-16-INVENTORY-OPERATOR-POLISH: Inventario cotidiano, categorías y etiquetas

## Evidencia observada en main
CHG-13 ofrece catálogo funcional, pero el formulario aún expone atributos como JSON crudo, genera SKU aleatorio y las configuraciones de etiquetas pueden guardarse asíncronamente sin confirmación visible en el diálogo. Falta refinar la operación diaria.

## Archivos y áreas de trabajo
- `src/routes/_app/inventory.tsx`
- `src/components/BarcodeLabel.tsx`
- `src/lib/catalog.js`
- `src/lib/settings.ts`
- `tests/browser/chg13-inventory-catalog.spec.mjs`

## Diseño propuesto
- Hacer más claros y accesibles formularios de SKU, nombre, categoría, marca, unidad, costo, precio y atributos opcionales.
- Optimizar búsqueda, estados activo/inactivo, acciones de fila, errores de campo, catálogo extenso y prevención de duplicados.
- Alinear la vista previa/impresión de etiquetas con la configuración realmente confirmada.

## Restricciones y decisiones
- Atributos estructurados opcionales; si se expone JSON en modo avanzado, agregar ayuda y validación local, no imponerlo a clientes habituales.
- No actualizar cantidad de productos existentes directamente: únicamente procedimientos de stock autorizados.
- No borrar productos con movimientos; mantener activación/desactivación con efecto visible en selectores.
- No cambiar semántica de UUID/SKU ni estructura de catálogo de CHG-12.

## Estrategia de verificación
- Validación del comportamiento autorizado y persistencia real; fallos de API, carga, cero filas y cambios de sesión.
- Captura visual comparativa escritorio/tablet/móvil y revisión de accesibilidad por teclado; no introducir una nueva identidad visual.
- Ejecutar pruebas aplicables del módulo, `npm test`, TypeScript, build y `openspec validate chg-16-inventory-operator-polish --strict` tras implementar.
- Las listas exhaustivas de QA manual (happy/sad/edge) corresponden a la fase 2, una vez completados estos Changes.
