# CHG-17-CLIENT-SUPPLIER-CREDIT-UX — Clientes, proveedores y cuentas de crédito

## Why
Clientes y proveedores replican formularios y tablas densos, con confirmaciones nativas para borrado/desactivación y modales complejos de créditos y pagos. Conviene reforzar claridad y recuperación de operaciones inciertas, conservando RPC de pago.

## What Changes
- Mejorar búsqueda, formularios, estados de cuenta y claridad de acciones de clientes/proveedores.
- Revisar modales de historial, detalle, saldos y pagos de crédito, incluido pendiente de reconciliación.
- Sustituir prompts/confirmaciones poco expresivos por confirmaciones accesibles donde aporte seguridad.

## Capabilities
### New Capabilities
- `party-and-credit-workflows-ux`: experiencia funcional y visual revisada de Grace Supply.

## Impact
- `src/routes/_app/clients.tsx`
- `src/routes/_app/suppliers.tsx`
- `src/lib/businessOperations.ts`
- `src/lib/storage.ts`
- `tests/browser/**`

## Boundaries
- Nunca tratar un pago incierto como fallido con seguridad ni reintentar sin consultar la clave idempotente.
- No ocultar ni eliminar referencias históricas de cliente/proveedor cuando tiene ventas, compras o créditos.
- Separar el permiso de administración de clientes de los datos mínimos que necesita un empleado de ventas.
- Arreglar caracteres mal codificados en mensajes de conciliación (ej. 'todav?a').

## Acceptance
Tres tareas verificables; mejoras acotadas, sin alterar contratos financieros/Auth existentes, con regresión funcional, accesibilidad, build y OpenSpec estricto.
