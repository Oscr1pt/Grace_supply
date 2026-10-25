# CHG-11 — Identidad integral de Grace Supply

## Why
La aplicación nació como jewel-sales-hub, pero el producto actual es Grace Supply, distribuidor de suministros de barbería, belleza y cuidado personal. La nomenclatura heredada genera confusión técnica y comercial.

## What Changes
- Auditar referencias de joyería, repositorio antiguo, paquetes, scripts, configuración, documentación activa, etiquetas y recursos.
- Unificar identidad de producto y nombre técnico `grace_supply` donde sea seguro y útil, sin hacer reemplazos indiscriminados.
- Mantener trazabilidad histórica y compatibilidad con el entorno Supabase ya desplegado.

## Capabilities
### New Capabilities
- `grace-supply-project-identity`: identidad y vocabulario actuales coherentes en aplicación y documentación operativa.

## Impact
`package.json`, lockfile, textos, documentación activa, scripts y configuración de despliegue, claves internas heredadas si aparecen. No incluye reescritura del catálogo ni migraciones históricas.

## Boundaries
NO renombrar el project ref `qazjfofpfcwopcefupjl`, timestamps o contenidos de migraciones aplicadas, archivos de auditoría inmutables, rutas en producción, históricos Git ni secretos. Revisar el identificador local de Supabase `jewel-sales-hub`: un cambio en `supabase/config.toml` puede cambiar nombres de contenedores; requiere evaluación de impacto antes de hacerlo. No cambiar automáticamente nombre remoto GitHub ni carpetas locales por buscar y reemplazar.

## Acceptance
La marca, los metadatos y el manifiesto del producto identifican Grace Supply; el preset visible para etiquetas no usa terminología de joyería. El contrato legado de inventario y su presentación específica se mantienen para CHG-12/CHG-13. Las referencias técnicas o históricas retenidas quedan inventariadas con su motivo. TypeScript, build, tests, rutas y OpenSpec pasan; no se modifican datos locales, Cloud ni proyectos externos.
