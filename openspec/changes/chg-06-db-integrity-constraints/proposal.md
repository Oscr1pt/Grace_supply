# Proposal — Integridad relacional, financiera y de inventario

## Why

Los SQL locales permiten montos y estados sin CHECK y usan una referencia polimórfica de pagos sin FK; ventas guardan líneas en objetos de aplicación. Se necesitan invariantes exigidas por PostgreSQL y una migración que preserve historial.

## What Changes

- Modelar referencias, líneas de venta y relación pago-crédito con IDs compatibles y montos decimales.
- **BREAKING**: incorporar CHECK, FK, UNIQUE e índices justificados, con saneamiento aprobado de anomalías existentes.
- Verificar importación histórica y rechazo de montos inválidos, stock negativo, huérfanos y duplicados.

## Capabilities

### New Capabilities

- `relational-financial-integrity`: integridad relacional, financiera y de inventario.

### Modified Capabilities

Ninguna; el inventario inicial de especificaciones principales está vacío.

## Impact

`src/lib/types.ts`, SQL versionado de CHG-03, clientes/proveedores/inventario/ventas/compras/créditos/pagos/gastos y conversión `toDb/fromDb`.

### Objetivo, evidencia y trazabilidad

Findings 6, según el roadmap. Estado: propuesta de planificación; ninguna medida está implementada ni verificada en el despliegue por esta ejecución. Fuente principal: `docs/database-remediation-roadmap.md`; no se encontró el informe original de auditoría, por lo que la numeración de Findings procede exclusivamente del roadmap.
La evidencia local detallada y sus límites se registran en `design.md`.

### Alcance y exclusiones

Este Change cubre únicamente la capacidad declarada. Quedan fuera DGII/e-CF, rediseño UI, actualizaciones de dependencias (CHG-02), limpieza general de caché entre usuarios (CHG-09) y QA integral de Phase 3. Esta entrega solo crea planificación OpenSpec; no modifica código, SQL ejecutable, datos, usuarios ni políticas remotas.

### Dependencias y límites entre Changes

Requiere CHG-03 y recuperación CHG-00; entrega invariantes y relaciones a CHG-07. CHG-05 cubre permisos de cualquier tabla nueva.

### Criterios de aceptación

PostgreSQL rechaza estados inválidos por cualquier vía; mapeo histórico conserva referencias y totales; no se borran filas para hacer pasar restricciones. Los escenarios de `specs/relational-financial-integrity/spec.md` especifican las comprobaciones de la futura implementación; validar estos documentos no equivale a superar esas pruebas.

### Riesgos y recuperación

Anomalías históricas, colisiones y bloqueos al validar constraints; detener migración, conservar evidencia restringida y recuperar sin eliminar documentos. El detalle del procedimiento está en `design.md`.

### Decisiones antes de implementar

Aprobar UUID para nuevos registros, escala/rounding monetario, unicidad por proveedor y tratamiento de anomalías sin corrección financiera automática. Toda intervención en el despliegue requiere autorización humana y respaldo/restauración aprobados conforme a CHG-00.

### Estado de validación de planificación

Validación individual aprobada con OpenSpec 1.14.3: `openspec validate chg-06-db-integrity-constraints --strict --no-interactive`. Cuatro artefactos completos y exactamente tres tareas pendientes, sin subtareas. La validación comprueba los documentos, no la eficacia de las futuras remediaciones en Supabase. Revisión final del conjunto: 2026-10-20.

