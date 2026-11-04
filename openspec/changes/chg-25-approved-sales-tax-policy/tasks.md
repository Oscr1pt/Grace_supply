# Tasks — CHG-25-APPROVED-SALES-TAX-POLICY

> Change activo **0/3**. Repositorio `Oscr1pt/Grace_supply`, rama de implementación `feature/frontend-improvements`, HEAD esperado `92545b671685fd809a3ee87ff82aa6a49dc29d59`. Recuperar 5 artefactos del PR docs sin merge; validar OpenSpec estricto antes de Apply. No commit/push/merge/archive en implementación. **Nunca habilitar Cloud solo para hacer pasar pruebas.**

## 1. Definición y aprobación responsable
- [ ] **1.1** Revisar junto al negocio la política tributaria/recibos: aplicación de impuesto y exenciones por producto, precios inclusivos/exclusivos, redondeo, fecha de vigencia, régimen y necesidad de NCF/e-CF, responsable que aprueba. Documentar opciones y dependencias verificables; en ausencia de decisión real, mantener política `pending`/bloqueada, sin simular aprobación. Establecer mecanismo seguro de aprobación/versionado con evidencia administrativa cuando alcance y autorización estén claros. **Verificación:** criterios comprobables; ningún flag `tax_policy_approved` se altera en Cloud por pruebas.

## 2. Implementación fiel y fail-closed
- [ ] **2.1** Implementar vía migraciones forward-only las reglas fiscales **efectivamente aprobadas** en `post_sale` usando `NUMERIC` y redondeo determinista; alinear estado `sales_posting_status`, vista previa, validadores y mensajes de la UI con las combinaciones soportadas. Mantener autorización, bloqueo de stock, cotización, transacción, idempotencia y snapshots. Si hay políticas no soportadas (p. ej., tasas por artículo/NCF/e-CF), dejarlas bloqueadas y documentar Change dependiente. **Verificación:** no posting por API sin política válida, ni acceso a facturas fiscales simuladas.

## 3. Prueba integral focalizada y readiness de venta
- [ ] **3.1** En Supabase local desechable y datos sintéticos, probar cálculo de impuestos/redondeo según política decidida, bloqueo previo y RPC denegada, roles/RLS, venta y crédito atómicos, stock concurrente, recibos persistidos, cambio de precio, idempotencia y respuestas inciertas; Playwright `Nueva venta` habilitado únicamente bajo política compatible. Ejecutar `npm test`, integración DB/Auth/RLS, Playwright, TypeScript, ESLint afectado, build, OpenSpec estricto y `git diff --check`. Verificar bloqueo de Cloud y requisito operativo de login/recovery pendiente. **Verificación:** ningún resultado ficticio ni salto de controles.

> Los tres criterios son conjuntos. Si la política tributaria real o el alcance fiscal del recibo no están aprobados, **no declarar 3/3 ni archivar CHG-25 como habilitación de ventas**, aunque el cálculo técnico esté probado con valores sintéticos. Conservar código/plan pendiente y reportar decisiones concretas al usuario.
