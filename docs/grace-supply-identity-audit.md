# Inventario de identidad de Grace Supply

**Fecha:** 2026-10-24

**Rama:** `feature/database-remediation`

**Revisión:** solo lectura del historial y del árbol de trabajo antes del cambio de identidad.

## Estado Git y recursos externos

La rama local está cuatro commits adelante y uno detrás de `origin/feature/database-remediation`. Los commits locales son `6d8d682`, `cef335d`, `ce557b9` y `2048a74`; el commit remoto pendiente es `b3a009d`. Hay modificaciones locales de Auth/recuperación y otros archivos sin seguimiento; CHG-11 las conserva y no las mezcla ni publica. La URL actual de `origin` es `https://github.com/Oscr1pt/Grace_supply.git`. No se cambia el remote, el nombre del repositorio ni la carpeta local `jewel-sales-hub`.

## Referencias que sí se normalizan en CHG-11

- `package.json` y el nombre raíz correspondiente de `package-lock.json` son el identificador npm privado `tanstack_start_ts`, heredado de la plantilla. Se cambia a `grace-supply`; no hay consumidores internos de ese nombre.
- `src/lib/settings.ts` llama `joyeria` al preset de etiqueta de 25 × 12 mm. El selector de `BarcodeLabel` lo deriva de las dimensiones guardadas y solo persiste ancho/alto y parámetros del código; la clave no es un ID guardado. Se cambia a `compacta` y se mantienen las dimensiones.
- La marca visible ya es GRACE SUPPLY en el nombre de negocio, metadatos y cabecera de acceso; se conserva.

## Referencias preservadas por compatibilidad o por alcance

- `supabase/config.toml` conserva `project_id = "jewel-sales-hub"`. Este nombre fija el stack/contenedor Supabase local habitual con datos existentes. Los verificadores CHG-00/03/10 y el test local financiero lo comprueban para evitar operar sobre otro contenedor; cambiarlo podría desconectar o recrear el entorno.
- Las 15 migraciones entre `20261021041426` y `20261022231000` y sus nombres/timestamps son contratos versionados ya aplicados. No se editan. El esquema, `src/lib/database.types.ts`, `src/lib/types.ts`, la ruta de inventario y `BarcodeLabel` aún usan `joya/piedra`, metal, quilates y campos `stone*`; CHG-12/13 introducirán la evolución aditiva y la experiencia de catálogo, sin alterar esta evidencia.
- Los scripts `chg00-verify-local.ps1`, `chg03-verify-local.ps1`, `chg10-local-verify.ps1` y `test-business-local.ps1` nombran el proyecto/contenedor local de forma explícita como guardas de seguridad. Se mantienen sin reemplazos globales.
- `lustre_*` permanece únicamente para limpiar caché antigua en inicio/salida, en la zona de limpieza local y en pruebas de CHG-09. La caché privada actual no restaura ni persiste filas; quitar esas claves impediría limpiar datos residuales de versiones anteriores.
- `docs/chg-00-*`, `docs/chg-03-*`, `docs/chg-06-*`, `docs/chg-09-*`, `docs/chg-10-*` y los Changes archivados conservan evidencia histórica con el antiguo nombre del stack. No se reescriben.
- `docs/deployment-readiness-qazjfofpfcwopcefupjl.md` tenía un riesgo de caché ya resuelto por CHG-09 descrito como pendiente; se actualizó el estado y se vinculó la evidencia vigente, sin cambiar la configuración de Cloud.
- `gold` en `src/styles.css` y `src/routes/login.tsx` nombra el color de la paleta visual de Grace Supply, no un producto de joyería.

## Verificaciones y acciones diferidas

La búsqueda cubrió `src`, `supabase`, `scripts`, `docs` y `openspec`, excluyendo dependencias, archivos de respaldo y lockfiles. Se verificaron el project id local, la versión remota de `origin`, el upstream y los cuatro commits no publicados. No se ejecutaron comandos Git destructivos, no se accedió a Supabase Cloud y no se modificaron datos.

Quedan fuera de CHG-11 el cambio de nombre del proyecto/repo/carpeta local, cualquier renombre de IDs remotos o rutas críticas, la migración del modelo de inventario y los cambios en migraciones aplicadas. La normalización restante del catálogo se ejecutará en CHG-12/13. Las ventas permanecen sujetas al bloqueo tributario vigente.
