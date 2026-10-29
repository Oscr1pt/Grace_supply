# Design — CHG-17-CLIENT-SUPPLIER-CREDIT-UX: Clientes, proveedores y cuentas de crédito

## Evidencia observada en main
Clientes y proveedores replican formularios y tablas densos, con confirmaciones nativas para borrado/desactivación y modales complejos de créditos y pagos. Conviene reforzar claridad y recuperación de operaciones inciertas, conservando RPC de pago.

## Archivos y áreas de trabajo
- `src/routes/_app/clients.tsx`
- `src/routes/_app/suppliers.tsx`
- `src/lib/businessOperations.ts`
- `src/lib/storage.ts`
- `tests/browser/**`

## Diseño propuesto
- Mejorar búsqueda, formularios, estados de cuenta y claridad de acciones de clientes/proveedores.
- Revisar modales de historial, detalle, saldos y pagos de crédito, incluido pendiente de reconciliación.
- Sustituir prompts/confirmaciones poco expresivos por confirmaciones accesibles donde aporte seguridad.

## Restricciones y decisiones
- Nunca tratar un pago incierto como fallido con seguridad ni reintentar sin consultar la clave idempotente.
- No ocultar ni eliminar referencias históricas de cliente/proveedor cuando tiene ventas, compras o créditos.
- Separar el permiso de administración de clientes de los datos mínimos que necesita un empleado de ventas.
- Arreglar caracteres mal codificados en mensajes de conciliación (ej. 'todav?a').

## Estrategia de verificación
- Validación del comportamiento autorizado y persistencia real; fallos de API, carga, cero filas y cambios de sesión.
- Captura visual comparativa escritorio/tablet/móvil y revisión de accesibilidad por teclado; no introducir una nueva identidad visual.
- Ejecutar pruebas aplicables del módulo, `npm test`, TypeScript, build y `openspec validate chg-17-client-supplier-credit-ux --strict` tras implementar.
- Las listas exhaustivas de QA manual (happy/sad/edge) corresponden a la fase 2, una vez completados estos Changes.
