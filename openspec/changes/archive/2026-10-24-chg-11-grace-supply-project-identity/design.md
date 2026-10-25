# Design — CHG-11

## Contexto verificado
La rama local es `feature/database-remediation`, con cuatro commits locales no publicados y un commit remoto pendiente (`b3a009d`). El árbol contiene 15 migraciones, en orden hasta `20261022231000_chg08_audit_expense_operations.sql`; las migraciones aplicadas son inmutables en este Change. El cliente ya tiene correcciones locales de Auth y recuperación de contraseña que deben conservarse.

El manifiesto npm todavía se llama `tanstack_start_ts`; el preset de etiqueta `joyeria` sigue en `src/lib/settings.ts`. `src/lib/types.ts`, `src/lib/database.types.ts`, `src/routes/_app/inventory.tsx` y `src/components/BarcodeLabel.tsx` aún contienen el contrato histórico `joya/piedra` y atributos de metal/quilates/piedras. Ese contrato de catálogo y su presentación pertenecen a CHG-12/CHG-13 y no se rediseñan en CHG-11.

`supabase/config.toml` mantiene `project_id = "jewel-sales-hub"`, que identifica el stack local habitual y su contenedor con datos existentes. Los scripts locales de prueba y reconstrucción lo comprueban deliberadamente. Las claves `lustre_*` solo se conservan en rutas de limpieza/compatibilidad y en pruebas de CHG-09. Los documentos de CHG-00/03/06/09/10 constituyen evidencia histórica y no deben reescribirse para borrar esos nombres.

## Decisiones
- Usar **GRACE SUPPLY** como marca y `grace_supply` como nombre técnico nuevo cuando no rompa identificadores estables. Para nombres npm, directorios y recursos verificar sintaxis aplicable; el slug visible puede ser `grace-supply` cuando el sistema exija guiones.
- Clasificar cada referencia como: UI activa; contrato activo; configuración local; documentación vigente; histórico inmutable; identificador externo estable. Solo las categorías que admiten cambio se renombran.
- Cambiar el nombre npm privado a `grace-supply` y el preset transitorio `joyeria` a `compacta`, conservando las dimensiones. No se persiste la clave del preset: la selección se deriva de las dimensiones guardadas.
- Distinguir renombre de repositorio GitHub, carpeta de Windows y proyecto Supabase: no son la misma operación. No realizarlos como efecto secundario. Si el usuario los desea, registrar pasos específicos y riesgos de URLs/remotes.
- Identificadores persistidos, claves de caché y formatos exportados requieren estrategia de lectura compatible o invalidación segura; no reemplazar sin pruebas.
- Mantener el `project_id` local, nombres de contenedor, claves `lustre_*` de limpieza y contrato de catálogo hasta un cambio que demuestre compatibilidad. CHG-11 actualiza identidad de aplicación y metadatos, no migraciones ni campos de producto.
- No ejecutar SQL ni borrar datos para ajustar branding.

## Verificación
Búsquedas case-insensitive de `jewel`, `joya`, `piedra`, `karat`, `carat`, `stone`, `metal`, `lustre`, `gold` con clasificación de falsos positivos: `gold` puede representar el color legítimo del diseño. Revisar manualmente resultados, TypeScript, build, tests y rutas principales.
