# Design — CHG-11

## Contexto verificado
La rama remota visible `feature/database-remediation` está en `b3a009d` y no incluye todos los commits y migraciones locales posteriores. `src/lib/settings.ts` conserva el preset `joyeria`; `src/lib/types.ts` y el inventario conservan conceptos de joyas; nombres antiguos también pueden aparecer en scripts, storage keys y config local. La rama de planificación no se supone fuente definitiva de código.

## Decisiones
- Usar **GRACE SUPPLY** como marca y `grace_supply` como nombre técnico nuevo cuando no rompa identificadores estables. Para nombres npm, directorios y recursos verificar sintaxis aplicable; el slug visible puede ser `grace-supply` cuando el sistema exija guiones.
- Clasificar cada referencia como: UI activa; contrato activo; configuración local; documentación vigente; histórico inmutable; identificador externo estable. Solo las categorías que admiten cambio se renombran.
- Distinguir renombre de repositorio GitHub, carpeta de Windows y proyecto Supabase: no son la misma operación. No realizarlos como efecto secundario. Si el usuario los desea, registrar pasos específicos y riesgos de URLs/remotes.
- Identificadores persistidos, claves de caché y formatos exportados requieren estrategia de lectura compatible o invalidación segura; no reemplazar sin pruebas.
- No ejecutar SQL ni borrar datos para ajustar branding.

## Verificación
Búsquedas case-insensitive de `jewel`, `joya`, `piedra`, `karat`, `carat`, `stone`, `metal`, `lustre`, `gold` con clasificación de falsos positivos: `gold` puede representar el color legítimo del diseño. Revisar manualmente resultados, TypeScript, build, tests y rutas principales.
