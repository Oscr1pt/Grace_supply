# CHG-16-INVENTORY-OPERATOR-POLISH — Inventario cotidiano, categorías y etiquetas

## Why
CHG-13 ofrece catálogo funcional, pero el formulario aún expone atributos como JSON crudo, genera SKU aleatorio y las configuraciones de etiquetas pueden guardarse asíncronamente sin confirmación visible en el diálogo. Falta refinar la operación diaria.

## What Changes
- Hacer más claros y accesibles formularios de SKU, nombre, categoría, marca, unidad, costo, precio y atributos opcionales.
- Optimizar búsqueda, estados activo/inactivo, acciones de fila, errores de campo, catálogo extenso y prevención de duplicados.
- Alinear la vista previa/impresión de etiquetas con la configuración realmente confirmada.

## Capabilities
### New Capabilities
- `inventory-operator-experience`: experiencia funcional y visual revisada de Grace Supply.

## Impact
- `src/routes/_app/inventory.tsx`
- `src/components/BarcodeLabel.tsx`
- `src/lib/catalog.js`
- `src/lib/settings.ts`
- `tests/browser/chg13-inventory-catalog.spec.mjs`

## Boundaries
- Atributos estructurados opcionales; si se expone JSON en modo avanzado, agregar ayuda y validación local, no imponerlo a clientes habituales.
- No actualizar cantidad de productos existentes directamente: únicamente procedimientos de stock autorizados.
- No borrar productos con movimientos; mantener activación/desactivación con efecto visible en selectores.
- No cambiar semántica de UUID/SKU ni estructura de catálogo de CHG-12.

## Acceptance
Tres tareas verificables; mejoras acotadas, sin alterar contratos financieros/Auth existentes, con regresión funcional, accesibilidad, build y OpenSpec estricto.
