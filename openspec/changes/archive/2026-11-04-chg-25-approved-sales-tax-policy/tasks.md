# Tasks — CHG-25-APPROVED-SALES-TAX-POLICY

> Implementación técnica V1 **3/3**. La habilitación comercial/tributaria real permanece pendiente de aprobación del propietario y su asesor; no activar ITBIS en Cloud ni afirmar cumplimiento fiscal.

## 1. Configuración y aprobación responsable
- [x] **1.1** Implementar en Ajustes la sección «Ventas e impuestos» con el interruptor «Aplicar ITBIS (18%)», precios sin impuesto incluido, clasificación `gravado/exento/pendiente`, estado `pending/approved` y confirmación administrativa. La aprobación operativa se registra en servidor; la determinación tributaria legal del negocio queda fuera de esta entrega y es requisito previo de habilitación comercial.

## 2. Implementación fiel y fail-closed
- [x] **2.1** Implementar mediante migración forward-only la configuración, clasificación y cálculo `NUMERIC`, manteniendo `post_sale` como única vía. La variante V1 calcula 18% solo sobre líneas `gravado`, cero sobre `exento`, rechaza `pendiente` y cualquier política no aprobada, conserva snapshots monetarios/tributarios y etiqueta recibos como internos. No existe posting por API sin política válida ni emisión fiscal simulada.

## 3. Prueba integral focalizada y readiness de venta
- [x] **3.1** En Supabase local desechable y con datos sintéticos se verificaron 18% gravado, exento, mixto, redondeo, cambios sin mutar históricos, permisos, doble envío, concurrencia, idempotencia, rechazo con política pendiente/no soportada y recibo interno. Auth/RLS (23/23), Playwright CHG-25 (2/2), `npm test` (106 PASS), TypeScript, ESLint, build y `git diff --check` están aprobados. La evidencia es técnica y no sustituye la aprobación comercial.

> Las tres tareas están completas para la entrega técnica V1. La aprobación tributaria real, el alcance legal del recibo y la habilitación comercial de Cloud son una puerta posterior independiente: deben documentarse antes de activar cobro de ITBIS y no se presumen por fixtures ni aprobaciones sintéticas.
