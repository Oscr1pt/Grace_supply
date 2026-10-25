# CHG-12 — Readiness de migración del catálogo

## Resultado local comprobado

- Nueva migración: `supabase/migrations/20261024051641_chg12_flexible_product_catalog.sql` (versión 16, posterior a las 15 originales).
- Se conservaron sin cambios las 15 migraciones previas. No se creó una tabla de categorías ni se insertaron productos o fixtures de catálogo.
- La configuración de Supabase local mantiene `[db.seed] enabled = false` y `sql_paths = []`; las reconstrucciones se ejecutan además con `--no-seed`.
- Dos reconstrucciones limpias y separadas aplicaron las 16 migraciones y obtuvieron el mismo fingerprint de esquema: `cb5a261a88c23fd43b4ab4dfdc33b009415323fdf3b246ac95a78e6d247d3dd6`.
- El upgrade sintético partió de las 15 migraciones anteriores. Preservó IDs, SKU, costo, precio, existencia, FK de compra, total de compra, FK y snapshots de venta. `metal` y `karat` se copiaron a `brand` y `presentation`; los demás valores legados se preservaron en `attributes.legacy` y sus columnas originales permanecieron intactas.
- El contrato SQL comprobó catálogo vacío, valores y categoría no previstos, defaults, grants, RLS, vista protegida y RPC. Las suites Auth/RLS pasaron 22/22; las operaciones financieras pasaron 20/20, incluyendo concurrencia, reintentos idempotentes, fallos transaccionales, auditoría y anulaciones. Ambos resultados fueron ejecutados contra Supabase local temporal.
- `tsc --noEmit` y `npm run build` pasaron. `npm test` terminó con 37 aprobadas, 0 fallidas y 1 suite local omitida por requerir conexión local explícita. OpenSpec validó CHG-12 en modo estricto.
- La validación global `openspec validate --all --strict` informó 12 aprobados y una advertencia/error ajena a CHG-12: `spec/grace-supply-project-identity` mantiene el texto placeholder en `## Purpose`. El Change CHG-11 y su spec no fueron modificados como parte de este trabajo.

## Contrato desplegado por la migración

`inventory` añade descripción, marca, presentación, unidad, atributos JSON objeto y estado activo. `category` permite texto libre. Productos nuevos usan `kind = 'product'`; se conservan `joya` y `piedra` para leer filas antiguas y mantener compatibilidad. Las columnas heredadas no se retiran en este Change.

RLS y grants de inventario existentes siguen rigiendo la edición del catálogo. Los grants de las columnas nuevas son específicos. Los triggers continúan reservando stock a las operaciones autorizadas; precio y costo siguen protegidos por el control de administrador. Los pickers y RPC transaccionales rechazan productos inactivos. Ventas continúan bloqueadas mientras falte la aprobación de la política tributaria.

## Fase futura de inspección Cloud — requiere autorización específica

No se ha enlazado ni consultado Cloud durante CHG-12. Cuando se autorice una inspección de solo lectura para `qazjfofpfcwopcefupjl`, confirmar primero visualmente el destino y ejecutar:

```powershell
supabase migration list --linked
supabase db push --dry-run --linked
```

La salida debe identificar el proyecto esperado y mostrar la migración `20261024051641` como la única versión pendiente, con las 15 versiones anteriores coincidentes. Guardar la salida y revisar el esquema/permisos del dry-run. Estos comandos solo quedan documentados; no se ejecutaron en esta fase. Un dry-run aprobado no autoriza el `db push` real.

Detener e informar antes de avanzar si el destino/ref no coincide, hay historial divergente o una versión remota desconocida, la migración aparece duplicada/faltante, el dry-run presenta operaciones distintas de las previstas, existen productos/datos con valores no mapeados, o hay diferencias de RLS, grants, vistas o RPC. No reparar el historial con `migration repair`, no usar `--include-all` y no aplicar manualmente SQL.

La ejecución real requerirá una autorización posterior separada, backup/restauración comprobables y revisión del dry-run. Después se verifican RLS/grants, consultas del catálogo, Auth/permisos, venta y compra por RPC en un entorno de desarrollo, auditoría e integridad histórica. No se habilitan ventas hasta contar con política tributaria aprobada.
