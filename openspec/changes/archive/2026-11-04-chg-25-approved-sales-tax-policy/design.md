# Design — CHG-25: Política tributaria y publicación segura de ventas

## Evidencia actual revisada

1. `src/lib/salesPolicy.js`: `deriveSalesPolicyState` devuelve `unknown`, `blocked`, `unsupported`, `approved` desde `tax_policy_approved` y `sales_posting_supported`. El estado desconocido falla cerrado.
2. `supabase/migrations/20261031120000_chg18_sales_posting_status.sql`: la vista `sales_posting_status` solo considera soportada política aprobada con `tax_prices_include=false`, redondeo no nulo, `tax_rate=0`; consulta protegida mediante `private.has_permission('sales')`.
3. `supabase/migrations/20261022220000_chg07_atomic_business_operations.sql`: `post_sale` exige `tax_policy_approved`, modalidad y redondeo presentes; rechaza impuestos incluidos y tasa no cero con `55000`. Usa `NUMERIC(14,2)`, bloqueo de stock, comprobación de precios cotizados, atomicidad, clave idempotente y snapshot de líneas. Actualmente calcula `v_tax=0`.
4. `src/routes/_app/sales.tsx`: previsualización estima `tax=round(subtotal*taxRate/100,2)`, pero Postgres es autoridad; la UI consulta el estado del servidor, deshabilita Nueva venta y revalida antes de postear.
5. `src/routes/_app/settings.tsx` muestra tasa editable y declara explícitamente que guardarla no aprueba facturación.
6. Specs `atomic-business-posting`, `safe-sales-purchases-ui`, `safe-business-settings-ui` obligan a no contabilizar hasta que la política sea aprobada, y a mantener evidencia inmutable.

## D1 — Política explícita y decisión del negocio (tarea 1.1)

- Levantar la matriz fiscal con propietario/asesor. Registrar en documento de configuración los campos aprobados: régimen/alcance; tasas y exenciones; si el precio incluye impuesto; regla exacta de redondeo; política por línea/documento; tipo de recibo; documentación NCF/e-CF; responsable y fecha. **No deducir valores reales del campo `tax_rate=18` por defecto**.
- Definir los modos de implementación soportados, restringidos por un identificador de política versionado y probado, con estado `draft/pending/approved` o equivalente que no dependa exclusivamente de un booleano editable desde el navegador.
- La aprobación solo debe realizarla un administrador autorizado y debe estar respaldada por decisión explícita del negocio; usar ruta de servidor autorizada y evidencia de identidad/momento/versión. La revocación o cambio significativo debe bloquear el posting hasta nueva aprobación. Preservar historial de políticas aplicadas, evitando reescrituras retrospectivas.
- Antes del análisis legal/técnico aprobado, limitar las pruebas a valores sintéticos sobre proyecto desechable, sin activar Cloud. Las tareas técnicas pueden marcarse completas para V1 cuando su evidencia exista; la decisión real sigue siendo una puerta de habilitación comercial separada.
- El flujo actual no genera por sí mismo una factura fiscal. Si se necesitan NCF/e-CF o reglas heterogéneas por producto, documentar el alcance separable y bloquear la opción fiscal hasta que exista implementación conforme. Distinguir recibo interno de factura tributaria.
- La pantalla «Ventas e impuestos» puede guardar una propuesta de tasa (18% por defecto), modo de precios sin impuesto incluido y el interruptor solicitado, pero cualquier estado distinto de `pending` debe exigir una aprobación administrativa persistida por el servidor. Cambiar el interruptor no puede saltarse la aprobación ni desbloquear ventas en Cloud.
- La clasificación de inventario debe ser explícita (`gravado`, `exento`, `pendiente`) y su ausencia debe fallar cerrado para una política que requiera clasificación. La clasificación y la tasa aplicada se conservarán como snapshots en cada venta aprobada.

## D2 — Cálculo y control del servidor (tarea 2.1)

- Conservar `post_sale`, `private.require_business_permission('sales')`, idempotencia/ledger, FOR UPDATE por producto, rechazo sin stock, control de cambios de precio, atomicidad venta/líneas/stock/crédito y auditoría de CHG-08.
- Implementar nuevas variantes fiscales **solo si están definidas y autorizadas**. Cálculos `NUMERIC` con precisión y redondeo deterministas; base de cálculo por línea/total explícita; suma exacta de líneas, tasa aplicable y total. Si el régimen del negocio exige tasas por artículo o exenciones, no suponer una tasa uniforme; proponer esquema/migración separado o incorporarlo únicamente si cabe seguro en CHG-25 sin superar alcance.
- Vista `sales_posting_status` e implementación `post_sale` deben compartir las condiciones para política verdaderamente soportada. Una vista que reporte “approved” mientras el servidor rechaza toda venta, o viceversa, es una regresión. Mantener datos mínimos y autorización por rol en la vista; revisar el comportamiento de security barrier y privilegios efectivos (no filtrar `settings`).
- La UI debe mostrar impuesto calculado/explicado bajo política confirmada. Los previews son informativos, pero el servidor calcula importes canónicos; si difieren, no prometer montos falsos ni hacer posting silencioso. No confiar en totales o tasas enviados por cliente como autoridad. Emisión de recibos no equivale a emisión DGII.
- Migraciones forward-only; no editar migraciones ya aplicadas. No conceder privilegios a `anon`/`PUBLIC` ni exponer funciones privilegiadas nuevas sin comprobaciones de identidad vigentes. No desbloquear ventas solo con flag sin política soportada.
- Para la variante propuesta, el cálculo será `NUMERIC`, por línea gravada, con redondeo determinista y total `subtotal + tax`; productos exentos aportan impuesto cero. Hasta contar con aprobación real, la implementación local debe permanecer en modo bloqueado y solo permitir pruebas sintéticas claramente etiquetadas.
- El recibo debe indicar «Documento interno — sin validez de comprobante fiscal» y no presentar NCF/e-CF ni lenguaje de cumplimiento DGII.

## D3 — QA y salida (tarea 3.1)

- Local Supabase desechable: identificar contenedor y host loopback, verificar migraciones y desplegar exclusivamente ahí. No alterar Cloud ni contenedores ajenos; fixture con datos sintéticos y política de test claramente etiquetada.
- Tests calculadora decimal: importes pequeños/grandes, centavos, cambio de tasa, base por línea/total, precios incluidos/excluidos solo si soportados, exenciones si definidas, doble redondeo, suma y subtotal consistentes. Cada regla fiscal pendiente de aprobación no se presentará como definitiva.
- Tests servidor/UI: autorización administradores/empleados, anon/revocados, no approval, unsupported, lectura de settings fallida, credenciales no disponibles, vista consistente con RPC, rollback por fallo de línea/stock, dos ventas misma unidad, idempotencia, timeout/reconciliación, créditos sin desbalances, snapshots de recibo no mutables.
- Si requiere NCF/e-CF, probar con sandbox oficial/proveedor autorizado en un Change separado; no generar documentos fiscales reales en estas pruebas.
- Ejecutar suites focalizadas PostgreSQL/Auth/RLS/Playwright, `npm test`, TypeScript, lint afectado, build, `git diff --check`, OpenSpec estricto. Evitar afirmar “facturación lista para Cloud” mientras esté pendiente decisión fiscal o recuperación de acceso a la cuenta habitual.

## Puerta final de aceptación

**Evidencia técnica**: pruebas locales verdes para variantes explícitamente soportadas.
**Evidencia de negocio**: política fiscal y uso del recibo aprobados por propietario/asesor, autorizaciones y fechas verificadas.
**Despliegue**: credenciales de administrador/recovery comprobadas en el entorno real, correo y redirects válidos, respaldo y checklist. Ningún punto puede presumirse por pruebas sintéticas.

Si falta evidencia de negocio, conservar el bloqueo de producción y no marcar la habilitación comercial como completa, aunque la implementación técnica V1 esté en 3/3.
