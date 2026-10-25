# Design

## Context

El repositorio tiene dos scripts SQL parciales, tipos TypeScript y consultas que hoy no forman una fuente de esquema completa. El remote Git verificado es Oscr1pt/Grace_supply. El ref aprobado para el nuevo proyecto es `qazjfofpfcwopcefupjl`; antes de cualquier operación remota se debe comprobar que la URL del MCP `supabase-grace-v2-write` coincide con ese destino. El proyecto anterior `ooytnnqxlxxgyenrutky` es solo referencia histórica. Las filas anteriores son de prueba y no necesitan migración.

## Goals / Non-Goals

**Goals:** una fuente canónica y versionada que instale el esquema desde cero de forma repetible y mantenga sincronizados PostgreSQL y TypeScript.

**Non-Goals:** migrar IDs, ventas, compras, créditos o cuentas ficticias; hacer backfill o conciliación histórica; ejecutar migraciones como parte de esta actualización de planificación.

## Decisions

### Fuente canónica

Adoptar supabase/migrations como única ruta de instalación. Crear una secuencia ordenada de migraciones pequeñas y revisables que construya el esquema desde una base vacía. Los scripts SQL sueltos existentes quedan como referencia histórica, no se ejecutan en la instalación nueva y no se mantienen como un segundo flujo.

El baseline cubre las tablas, columnas, relaciones, vistas, funciones y defaults requeridos por las rutas vigentes, coordinado con Auth de CHG-04, RLS de CHG-05, constraints de CHG-06, operaciones de CHG-07 y auditoría de CHG-08. CHG-03 y CHG-06 comparten un solo modelo canónico: CHG-03 organiza la secuencia limpia y CHG-06 especifica las relaciones e invariantes que esa secuencia implementa. Cada cambio de esquema futuro se agrega como migración versionada; no editar silenciosamente una versión ya aplicada.

### Contrato de IDs y datos

Usar UUID generados en PostgreSQL para entidades y referencias, con tipos TypeScript compatibles. Definir relaciones e invariantes de forma coordinada con CHG-06 y adaptar serialización de objetos anidados donde aplique. Crear filas iniciales necesarias, como settings singleton, de manera determinista y sin sobrescribir cambios de usuario.

No importar ni mapear las filas de prueba actuales. Las pruebas usan semillas sintéticas versionadas fuera de las migraciones de esquema cuando sea posible. Si una instalación no está vacía o revela datos que no parecen sintéticos, detener el flujo y pedir confirmación antes de alterar datos.

### Seguridad por defecto y comprobaciones

Las migraciones no conceden acceso a anon ni introducen políticas globales. CHG-05 es dueño de la matriz permanente. Validar sobre Supabase local desde cero, comparar la versión de migración aplicada y revisar el resultado del esquema. Una instalación limpia, no un upgrade histórico, es el criterio principal de reproducibilidad.

Si una migración de esquema requiere transformación de datos para una nueva versión ya entregada, definirla como cambio futuro específico con precondiciones y recuperación; no anticipar ahora un sistema general de backfill para datos ficticios.

## Risks / Trade-offs

- Inventario local incompleto → completar contratos de todas las rutas y tipos antes de congelar el baseline.
- Scripts antiguos confunden operadores → documentarlos como no canónicos y retirar su uso de instalación futura.
- Migración no repetible → probar secuencia completa sobre base vacía en CI/local.
- Datos inesperados → detener y pedir autorización antes de cualquier transformación o reset.

## Migration Plan

Diseñar el baseline, actualizar TypeScript y probar la secuencia completa en Supabase local/aislado. Confirmar luego la identidad del proyecto y el estado del esquema únicamente con metadatos antes de planear una aplicación remota. No borrar ni migrar filas en este Change. Antes de una entrega, probar restauración y configuración separada conforme a CHG-00.

