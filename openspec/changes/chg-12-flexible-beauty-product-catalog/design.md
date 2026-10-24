# Design — CHG-12

## Evidencia y riesgo
En el código remoto antiguo `InventoryItem.kind = "joya"|"piedra"`, `category` enum de joyas y `metal/karat/stone*` representan marca/presentación/detalles. La DB Cloud ya recibió 15 migraciones posteriores, cuyo DDL debe releerse en la rama local antes de diseñar el ALTER. No inferir columnas exactas desde GitHub remoto.

## Contrato propuesto
- Identidad: UUID estable, SKU/código de barras único por contrato, nombre obligatorio, descripción opcional.
- Clasificación: categoría configurable por la empresa (tabla de categorías o texto libre con controles; elegir según DDL y requisitos verificados). Sugerencias opcionales: Máquinas y herramientas, Cuidado capilar, Cuidado de barba, Estética y piel, Consumibles, Repuestos, Otros. Deben poder crear otras.
- Atributos opcionales: marca/fabricante, presentación/tamaño, unidad de medida, especificación/variante; evitar campos de joyería.
- Importes: costo y precio con escala y checks ya definidos; inventario inicial/movimientos solo por operaciones autorizadas según CHG-07/08.
- No generar ni insertar productos reales por defecto; el catálogo vacío es válido.

## Migración
Crear **nueva** migración posterior a `20261022231000`. Primero inspeccionar esquema local actual y conteos Cloud de solo lectura. Expandir con campos genéricos, copiar valores significativos de columnas anteriores conservando semántica (p. ej., antigua metal que significa marca), verificar integridad y adaptar TypeScript. No retirar columnas ni enums si RPC, vistas o registros existentes los usan. Si hace falta contracción, posponer hasta demostrar compatibilidad y aprobar explícitamente impacto; conservar inmutabilidad financiera.

## Seguridad
Reutilizar grants/RLS, comprobación admin/permiso inventory, validación en servidor de precio y stock, y operaciones auditadas. No habilitar escritura directa de stock o alteración de movimientos por crear el producto.

## Pruebas
Alta con categoría nueva creada por cliente; sin categoría predefinida; nombre/sku duplicado o vacío; moneda DOP; precio negativo; accesos sin permiso; facturas históricas conservan identificador y descripción de línea; stock/concurrencia; instalación limpia y upgrade sintético; dry-run Cloud antes de push y aprobación separada.
