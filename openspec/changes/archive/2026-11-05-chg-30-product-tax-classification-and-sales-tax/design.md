# Design

## Context

El frontend ya expone `tax_classification`, pero Cloud no concede al rol `authenticated` INSERT/UPDATE sobre esa columna. Las políticas de `inventory` y los guards existentes deben conservarse, y `post_sale` ya calcula ITBIS según la clasificación cuando la migración tributaria está instalada. El cambio debe ser forward-only y no puede depender de Cloud durante el desarrollo.

## Goals / Non-Goals

**Goals:**

- Ofrecer una vía administrativa mínima y auditable para clasificar productos nuevos y existentes.
- Mantener `Pendiente` como estado seguro y evitar accesos REST directos que eludan autorización.
- Alinear la vista previa, el mapeo de errores y el cálculo autoritativo de `post_sale`.
- Probar permisos, concurrencia, persistencia e invariantes de inventario en Supabase local desechable.

**Non-Goals:**

- No modificar migraciones históricas, Cloud, reglas financieras ni la política tributaria legal.
- No conceder UPDATE general sobre `inventory`, ni permitir escrituras directas de `quantity`.
- No crear un canal alternativo de ventas ni emitir documentos fiscales.

## Decisions

1. **RPC administrativa específica en PostgreSQL.** Se añadirá una función `set_product_tax_classification(jsonb)` `SECURITY DEFINER`, con `search_path` fijo, que exigirá sesión, permiso `inventory` y administrador activo, bloqueará la fila del producto y validará los tres valores permitidos. Se elige sobre un grant de columna porque permite autorización uniforme, bloqueo y auditoría en una sola operación; un grant directo dejaría más superficie para REST y no resolvería el registro de actor/valores.

2. **Auditoría dedicada.** Se creará una tabla mínima `inventory_tax_classification_audit` con producto, actor, valores anterior/nuevo y fecha, RLS sin escritura para clientes y lectura administrativa. Se elige sobre reutilizar `financial_audit_events` porque cambiar clasificación no es una operación financiera ni debe crear movimientos o idempotencias ficticias.

3. **Creación en dos pasos seguros.** El formulario creará el producto con `Pendiente` y, si el administrador eligió otra clasificación, llamará a la RPC usando el UUID confirmado. Si el segundo paso falla, el producto permanece con stock y clasificación segura, el formulario conserva el estado y no anuncia éxito tributario.

4. **Una sola fuente para el cálculo visual.** La previsualización reutilizará la política y clasificación ya cargadas, redondeará por línea con la misma regla de `post_sale` y mapeará por código/mensaje `financial_tax_policy_pending` frente a `tax_classification_pending`. La UI no podrá sustituir los importes devueltos por PostgreSQL.

5. **Alternativas descartadas.** No se usará UPDATE directo de `inventory`, service-role en el navegador ni una relajación de RLS. Tampoco se cambiará `post_sale`; solo se ajustarán consultas, validación visual y traducción de errores cuando la evidencia local lo requiera.

## Risks / Trade-offs

- **[RPC SECURITY DEFINER]** → fijar `search_path`, revocar `PUBLIC`/`anon`, conceder solo a `authenticated` y validar `auth.uid()`/permiso dentro de la función.
- **[Dos pasos de creación]** → un fallo entre creación y clasificación deja el producto en `Pendiente`; la UI lo comunica y permite reintentar con el mismo UUID, sin duplicar producto.
- **[Auditoría adicional]** → añade una tabla y migración; se mantiene aislada de los documentos financieros y con RLS explícito.
- **[Datos Cloud desactualizados]** → las pruebas se ejecutarán solo en un stack local con migraciones completas; no se afirmará compatibilidad Cloud hasta desplegar y verificar las migraciones previas.

## Migration Plan

1. Crear una migración forward-only para la tabla de auditoría, la RPC, grants/revokes y cualquier vista/consulta mínima necesaria.
2. Aplicarla únicamente en un stack local desechable y ejecutar pruebas unitarias, Auth/RLS, financieras y Playwright.
3. Verificar que no cambian cantidad, precios, stock, créditos ni recibos al clasificar.
4. Preparar posteriormente un dry-run Cloud separado; no ejecutar `db push` como parte de este Change.
5. No se define rollback destructivo: ante fallo se detiene la migración y se conserva el estado anterior; cualquier reversión futura requerirá una migración explícita revisada.
