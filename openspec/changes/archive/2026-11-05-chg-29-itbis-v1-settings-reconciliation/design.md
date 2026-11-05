# Design

## Context

CHG-28 dejó una RPC `save_sales_tax_v1(jsonb)` y una política V1 de 18%, pero el proyecto Cloud diagnosticado no contiene todavía esa RPC, `sales_posting_status` ni la columna `tax_calculation_enabled`. El cliente debe conservar el cierre seguro ante un esquema desactualizado.

## Goals / Non-Goals

**Goals:**

- Hacer que la UI exponga solo el modo V1 soportado: «Aplicar ITBIS» desactivado por defecto y tasa interna 18%.
- Mantener una escritura administrativa única y auditable, con errores distinguibles entre objeto ausente, conflicto y autorización.
- Producir un inventario reproducible de migraciones/objetos pendientes y un plan de despliegue reversible.

**Non-Goals:**

- No cambiar migraciones históricas, RLS, contratos financieros ni datos Cloud.
- No habilitar ventas comerciales ni simular aprobación tributaria legal.
- No crear una segunda aprobación de pantalla ni una tasa arbitraria.

## Decisions

- La UI eliminará el control editable de tasa y enviará siempre `tax_rate: 18`; el backend seguirá rechazando cualquier valor distinto.
- Se conservará `save_sales_tax_v1` como frontera de escritura. Un error `42883`, `42703`, `42P01` u objeto equivalente se mapeará a «El servidor requiere una actualización»; `42501` conservará el mensaje de autorización.
- La reconciliación Cloud será un procedimiento de lectura: comparar archivos locales con `schema_migrations`, funciones, vistas, grants y dependencias; `db push --dry-run` solo se usará si la CLI y el proyecto vinculado están verificados.
- Los escenarios de prueba usarán un stack local desechable con todas las migraciones y comprobarán ambos modos de venta, permisos y persistencia tras recarga.

## Risks / Trade-offs

- [Riesgo] El esquema Cloud puede quedar temporalmente incompatible con el cliente publicado. → El cliente mostrará un error de actualización explícito y no habilitará ventas.
- [Riesgo] El historial de migraciones remoto puede divergir de los nombres locales. → El plan exige respaldo, comparación de versiones y reconciliación manual antes de cualquier push.
- [Riesgo] Ocultar la tasa puede dificultar soporte operativo. → Se mantiene 18% en mensajes de V1 y en la respuesta confirmada del servidor.

## Migration Plan

No se crea ni aplica migración en este Change. Antes de Cloud: respaldo verificable, revisión del orden CHG-18 → CHG-25 → CHG-28, dry-run autorizado, aplicación controlada y pruebas de RPC, RLS, stock, idempotencia y recibos. Rollback: detener ventas, restaurar desde respaldo o ejecutar una migración correctiva forward-only; nunca editar `schema_migrations` manualmente.

## Open Questions

Ninguna que cambie el alcance: la aprobación comercial/contable del ITBIS permanece fuera de este Change.
