# CHG-19 — Gastos y experiencia operativa

## Why

El módulo `src/routes/_app/expenses.tsx` permite registrar y consultar gastos mediante las RPC financieras auditadas, pero presenta problemas de experiencia que conviene corregir sin cambiar la lógica contable: el campo de fecha y los indicadores de «hoy»/«mes» usan `toISOString().slice(...)` (UTC y no calendario dominicano), las anulaciones piden el motivo mediante `window.prompt`, hay etiquetas con contraste débil en tema claro y el registro carece de mensajes de validación por campo y de estados de lectura claramente diferenciados.

## What Changes

- Hacer comprensible el formulario de gasto: concepto, categoría, importe, fecha del gasto, medio de pago, beneficiario, referencia/comprobante opcional y notas; mostrar validaciones junto al campo, estados de guardado y errores recuperables sin falsos éxitos.
- Alinear la fecha predeterminada, «hoy», «mes» y los filtros con el calendario local del negocio (`America/Santo_Domingo`), sin alterar la semántica de las fechas ya persistidas. Clarificar resúmenes, búsqueda, estados registrado/anulado, detalles, responsive y contraste.
- Sustituir `window.prompt` de anulación por una confirmación accesible con motivo obligatorio, pendientes y permisos visibles; mantener intactas las operaciones PostgreSQL auditadas y las claves de idempotencia.

## Capabilities

### New Capabilities

- `expenses-workflow-ux`: registro, consulta y anulación de gastos comprensibles, persistentes y recuperables.

## Impact

- Principal: `src/routes/_app/expenses.tsx`.
- Utilidades visuales reutilizables solo si son necesarias: `src/components/ui/alert-dialog.tsx`, `src/components/PageHeader.tsx`, funciones acotadas de fecha en `src/lib/**`.
- Pruebas específicas: `tests/browser/**` y pruebas existentes financieras/seguridad que corresponda ejecutar.
- No requiere migraciones, cambios de contratos RPC ni modificaciones generales de Auth.

## Boundaries

- Los gastos se crean exclusivamente con `post_expense`; las anulaciones exclusivamente con `annul_financial_document`. No UPDATE/DELETE financiero directo ni alteración de evidencia histórica, compensación o auditoría.
- El monto y la confirmación definitivos corresponden al registro persistido/resultado autorizado de PostgreSQL; la UI puede mostrar sumas de **registros confirmados** como indicadores, correctamente etiquetados, sin sustituir la fuente de verdad.
- No activar ventas ni modificar la política fiscal, ni rehacer módulos CHG-18 o CHG-21.
- Respetar permisos y RLS; la UI no concede derechos. No habilitar acciones administrativas a empleados sin autorización.
- No añadir subida/almacenamiento de archivos ni contabilidad nueva: «comprobante» es la referencia textual ya existente.

## Acceptance

Tres tareas verificables. Validaciones locales y de fecha RD, persistencia única ante doble clic/respuesta incierta, anulación autorizada con motivo y conservación del original, filtros y sumas consistentes, accesibilidad teclado/móvil/tema claro y oscuro, tests enfocados, calidad estática, build y OpenSpec estricto.

**Dependencia:** CHG-18 ya está archivado **en el checkout local**, pero el remoto `feature/frontend-improvements` todavía puede mostrar su versión previa sin archivar. Antes de aplicar CHG-19, Codex debe verificar el archivo local de CHG-18 y traer únicamente estos documentos de planificación, preservando cambios locales ajenos.
