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
Sin referencias de joyería en experiencia activa ni configuración operativa incorrecta; las referencias históricas justificadas quedan inventariadas. Tests, build, OpenSpec y uso de Supabase local funcionan; Cloud no se modifica por esta planificación.
