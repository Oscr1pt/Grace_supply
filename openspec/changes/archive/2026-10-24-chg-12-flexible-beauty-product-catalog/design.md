# Design — CHG-12

## Evidencia y riesgo
Antes de CHG-12, la rama local contenía 15 migraciones versionadas, de `20261021041426_chg00_new_project_containment.sql` a `20261022231000_chg08_audit_expense_operations.sql`. La migración que implementa este Change es la versión 16. El esquema previo definía `inventory.kind` como `joya|piedra`, categorías de joyería y columnas `metal`, `karat`, `stone`, `stone_carats`, `stone_cut`, `stone_clarity` y `stone_color`; estos nombres todavía existen para compatibilidad de filas históricas. No se debe inferir el esquema Cloud de una rama remota anterior: comparar el historial remoto y el dry-run en una fase autorizada antes de cualquier push.

La rama local ya implementa operaciones de negocio transaccionales en `post_sale`, `post_purchase`, `adjust_inventory`, pagos y anulaciones; guarda snapshots SKU/nombre/precio de las líneas, usa claves idempotentes y mantiene auditoría append-only. `src/lib/businessOperations.ts` conserva la confirmación/reconciliación por RPC y bloquea ventas cuando PostgreSQL indica que la política tributaria no está aprobada (`55000`). CHG-12 debe adaptar el contrato sin eludir estas rutas ni habilitar ventas.

## Contrato propuesto
- Identidad: UUID estable, SKU/código de barras único por contrato, nombre obligatorio, descripción opcional.
- Clasificación: `category` de texto libre no vacío; no requiere una tabla ni enumeración y acepta categorías nuevas sin migración. No se insertan categorías o productos precargados.
- Atributos opcionales: `description`, `brand`, `presentation`, `unit` y `attributes` JSON objeto para especificaciones/variantes adicionales; `is_active` controla la disponibilidad del producto.
- Importes: costo y precio con escala y checks ya definidos; inventario inicial/movimientos solo por operaciones autorizadas según CHG-07/08.
- No generar ni insertar productos reales por defecto; el catálogo vacío es válido.

## Migración
Crear **nueva** migración posterior a `20261022231000`. El orden local y el DDL ya están inventariados; no modificar los 15 archivos existentes. Verificar el estado Cloud solo en la fase de inspección autorizada. Expandir con campos genéricos, copiar valores significativos de columnas anteriores conservando semántica (p. ej., antigua `metal` que significa marca), verificar integridad y adaptar TypeScript. No retirar columnas ni enums si RPC, vistas o registros existentes los usan. Si hace falta contracción, posponer hasta demostrar compatibilidad y aprobar explícitamente impacto; conservar inmutabilidad financiera.

## Seguridad
Reutilizar grants/RLS, comprobación admin/permiso inventory, validación en servidor de precio y stock, y operaciones auditadas. No habilitar escritura directa de stock o alteración de movimientos por crear el producto.

## Revisión Explore contra la rama de trabajo
- CHG-11 está archivado. CHG-12 está validado en esquema `spec-driven`, con 0/3 tareas al inicio de la implementación.
- Confirmado al explorar: las 15 migraciones base terminaban en `20261022231000`; el esquema inicial restringía `kind` y `category`, y la UI enviaba campos heredados. No se editaron esas migraciones; CHG-12 añade `20261024051641` como versión 16.
- La rama local habitual contiene 7 productos y 7 compras que conservan `item_id`; no hay líneas de venta. Los campos `metal`, `karat`, `weight_grams`, `stone*`, `size_mm` y `size_label` están vacíos. El catálogo Cloud consultado previamente en la fase de inspección autorizada estaba vacío. Ninguno de estos datos se usará como entorno de prueba.
- `post_sale` y `post_purchase` son RPC transaccionales; las líneas de venta guardan snapshots, y los triggers existentes impiden cambios directos de stock. Los grants actuales solo habilitan columnas específicas y RLS exige permiso `inventory`.
- Mantener las columnas heredadas y los valores `kind` para compatibilidad e historia; permitir nuevos productos neutros (`kind='product'`) y valores de categoría libres. Copiar `metal` a `brand`, `karat` a `presentation` y preservar cualquier especificación legada restante en `attributes.legacy` sin eliminar su columna original.
- La única superficie que se adaptará en CHG-12 es el formulario de inventario necesario para crear/editar el contrato neutro. La experiencia ampliada de ventas e inventario continúa en CHG-13.

## Pruebas
Alta con categoría nueva creada por cliente; sin categoría predefinida; nombre/sku duplicado o vacío; moneda DOP; precio negativo; accesos sin permiso; facturas históricas conservan identificador y descripción de línea; stock/concurrencia; instalación limpia y upgrade sintético; dry-run Cloud antes de push y aprobación separada.
