# CHG-06 — Evidencia de integridad relacional y financiera

## Alcance y coordinación con CHG-03

CHG-06 define relaciones e invariantes; CHG-03 conserva la propiedad de la secuencia de instalación. La migración existente `supabase/migrations/20261022000000_chg03_versioned_domain_schema.sql` no se modificó ni se reescribió. Su SHA-256 sigue siendo `32e9d86bc8261f3d008473ead297a874b88efae14595df09d52ee915448fb8ae`. No se aplicó nada a Supabase Cloud ni se consultó el proyecto anterior.

Las doce tablas revisadas y sus relaciones son:

| Tabla | Clave primaria | Claves foráneas / unicidad relacional |
| --- | --- | --- |
| `clients` | `id uuid` | Sin FK saliente |
| `suppliers` | `id uuid` | Sin FK saliente |
| `inventory` | `id uuid` | `sku` UNIQUE |
| `sales` | `id uuid` | `client_id → clients.id` RESTRICT; `receipt_no` UNIQUE |
| `sale_lines` | `id uuid` | `sale_id → sales.id` RESTRICT; `item_id → inventory.id` RESTRICT |
| `purchases` | `id uuid` | `supplier_id → suppliers.id` RESTRICT, nullable; `item_id → inventory.id` RESTRICT, nullable |
| `client_credits` | `id uuid` | `sale_id → sales.id` RESTRICT, UNIQUE; `client_id → clients.id` RESTRICT |
| `supplier_credits` | `id uuid` | `purchase_id → purchases.id` RESTRICT, UNIQUE; `supplier_id → suppliers.id` RESTRICT, nullable |
| `credit_payments` | `id uuid` | `client_credit_id → client_credits.id` o `supplier_credit_id → supplier_credits.id`, ambas RESTRICT y una exactamente presente |
| `expenses` | `id uuid` | Sin FK saliente |
| `settings` | `id uuid` fijo a `00000000-0000-0000-0000-000000000001` | CHECK de singleton; una fila determinista al instalar |
| `user_profiles` | `id uuid` | `auth_user_id → auth.users.id` RESTRICT y UNIQUE; `normalized_username` generado y UNIQUE |

Las claves primarias y referencias de negocio son UUID. `settings.id` es la excepción intencional al UUID aleatorio: es el UUID estable del singleton. `user_profiles.normalized_username` es generado por PostgreSQL a partir de `username` y no es escribible por el cliente.

`src/lib/database.types.ts` ahora enumera las mismas relaciones y nombres de constraints del SQL. `Relationships` dejó de ser una lista vacía. Las FK `sale_id`, `purchase_id` y `auth_user_id` con destino UNIQUE se expresan como uno-a-uno; las demás son muchos-a-uno. El tipo de Insert/Update excluye `normalized_username`. Las consultas de ventas del adaptador leen `sale_lines`; las escrituras separan el encabezado de sus líneas. Los pagos usan una unión TypeScript que exige `clientCreditId` o `supplierCreditId`, nunca ambos.

## Dominios y restricciones comprobados

- Dinero de ventas, compras, créditos, pagos, gastos y snapshots de precio usa `NUMERIC(14,2)` con rangos; `settings.tax_rate` usa `NUMERIC(5,2)`. Pesos, quilates y dimensiones usan `NUMERIC(10,3)`; cantidades de inventario y documentos son enteras.
- CHECK restringe estados, categorías, tipos de pago y métodos; exige stock no negativo, cantidades de línea/compra positivas, importes dentro del dominio, `sales.total = subtotal + tax` y `credit.paid + credit.balance = total`.
- Líneas de venta mantienen SKU, nombre y precio unitario como snapshots. Los cambios al precio de inventario no alteran la línea.
- FK vinculadas usan borrado restrictivo. Pagos requieren exactamente una FK válida de crédito.
- Únicos actuales: SKU, número de recibo, venta por crédito, compra por crédito, identidad de Auth por perfil, y nombre de usuario normalizado. No se añadieron restricciones de unicidad no aprobadas.
- RLS sigue activado y anon/authenticated permanecen sin privilegios; la prueba no concedió accesos nuevos.

## Reglas de negocio aún abiertas

No se establece aquí una tasa tributaria comercial ni si el precio incluye impuesto, el orden de cálculo o redondeo. El CHECK aritmético del total no decide esa fórmula. Tampoco se decide que el subtotal deba igualar la suma de líneas, los estados y transiciones de crédito, las consecuencias contables de anular/devolver una operación, si una referencia de proveedor por texto basta para conceder crédito, ni la unicidad de números de factura de compra o RNC. Son decisiones de negocio/operaciones que no se inventan como parte de CHG-06.

CHG-04 es responsable del ciclo de Auth y perfiles (altas, login, roles, contraseñas/identidades); CHG-06 solo fija la FK estructural al usuario Auth. CHG-07 es responsable de las transacciones que coordinan venta, líneas, stock, crédito y pagos; la integración actual de CHG-03 no promete atomicidad entre llamadas.

## Verificación local

El 2026-10-22 se ejecutó `scripts/chg03-verify-local.ps1` fuera del sandbox para que Docker pudiera acceder al Engine. La ejecución terminó con exit code 0 y mostró `Local CHG-03 reconstruction verification finished.`. El script restringe el proyecto a `jewel-sales-hub`, exige `--local`, rechaza parámetros de enlace remoto y restaura el baseline al final.

Resultados observados:

- Aplicó, en orden, las migraciones `20261021041426`, `20261021043648` y `20261022000000`.
- Pasaron las aserciones de contrato SQL, incluidas relaciones válidas y snapshots, singleton settings/DOP, denegación por defecto, importe negativo, monto no finito, stock negativo, referencia huérfana, pago ambiguo y número de recibo duplicado.
- Los fixtures sintéticos se revirtieron y sus marcadores no permanecieron.
- Dos reconstrucciones produjeron firmas de columnas, defaults, constraints, índices, RLS y policies idénticas.
- La migración con precondición intencionalmente inválida falló sin cambios parciales ni versión aplicada; el reset final restauró el esquema y el historial.
- `tsc --noEmit` pasó después de alinear la metadata de relaciones.
- `npm run build` pasó para cliente, SSR y Nitro; solo mostró advertencias existentes de tamaño/configuración/dependencias.
- `openspec.cmd validate --changes --strict` pasó para los ocho Changes (8 aprobados, 0 fallidos).
- `git diff --check` terminó con exit code 0; Git solo informó advertencias de conversión LF/CRLF.
- `EXPLAIN (COSTS OFF)` local reconoció índices para ventas por cliente, líneas por venta/artículo, compras por proveedor/artículo, créditos por contraparte/estado, pagos por cada FK y gastos por fecha/estado. Se usó `SET enable_seqscan = off` para hacer visible la ruta indexada en tablas vacías; esto demuestra cobertura del índice, no rendimiento con datos de producción ni una decisión de plan del planner bajo estadísticas reales.

La suite hace resets destructivos únicamente del stack Supabase local. No se ejecutaron resets ni consultas remotas.

## Estado de tareas

- CHG-06 1.1: completo — modelo coordinado y tipos SQL/TypeScript cotejados con fixtures sintéticos.
- CHG-06 2.1: completo — restricciones versionadas revisadas, casos válidos/inválidos ejecutados e índices examinados con planes locales.
- CHG-06 3.1: completo — bootstrap, pruebas de rechazo, repetibilidad y permisos por defecto comprobados localmente.
- CHG-03 1.1: completo — coordinación estructural cerrada; no depende de implementar Auth (CHG-04) ni atomicidad (CHG-07).
