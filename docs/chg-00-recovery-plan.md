# CHG-00 Recuperación y corte previo a la entrega

**Estado:** identidad del proyecto nuevo comprobada; la migración de seguridad CHG-00 permanece aplicada y registrada. El proyecto anterior `ooytnnqxlxxgyenrutky` es solo evidencia histórica.

## Evidencia actual de recuperación

- La configuración efectiva de `supabase-grace-v2-write` en `C:\Users\oscar\.codex\config.toml` contiene `project_ref=qazjfofpfcwopcefupjl`. Esta prueba de identidad corresponde al destino nuevo; no reutiliza la evidencia histórica del proyecto anterior.
- `.env` apunta ahora al endpoint del proyecto nuevo y las claves heredadas del proyecto histórico se vaciaron. La clave publishable nueva aún debe configurarse desde el panel del proyecto correcto antes de usar la app.
- El proyecto nuevo sigue sin relaciones comerciales y tiene dos migraciones registradas (`20261021041426`, `20261021043648`). No se leyeron filas privadas. Evidencia detallada en `docs/chg-00-new-project-evidence.md`.
- Docker Desktop 4.45.0 / Engine 28.3.3 está disponible. Desde Codex fue necesario ejecutar Docker/Supabase CLI con autorización elevada porque el sandbox denegaba acceso a la configuración/contexto Docker; no se cambiaron permisos de Windows ni Docker. Se comprobó `project_id=jewel-sales-hub`, ausencia de marcador de enlace y ausencia de contenedores Supabase ajenos antes de ejecutar exclusivamente `npx.cmd --yes supabase db reset --local --no-seed --yes --workdir C:\Users\oscar\jewel-sales-hub`. El reset local terminó aplicando ambas migraciones; no se usó `--linked` y el historial Cloud quedó intacto.
- La migración `20261021041426` se conserva intacta y `20261021043648_chg00_revoke_public_function_defaults.sql` corrige el default global de `EXECUTE` encontrado por la prueba RPC. El entry point GraphQL sigue siendo ejecutable por los clientes porque sus ACL pertenecen a `supabase_admin`; no se alteraron roles internos ni se intentó eludir permisos administrativos.
- **Resultado del ensayo local limpio:** las migraciones aplicaron y `supabase migration list --local` muestra las versiones locales esperadas `20261021041426` y `20261021043648`; hay cero relaciones en `public` y no quedó el objeto sintético. La suite completa `supabase/tests/chg00_containment.sql` falló en la aserción de lectura de `extensions.pg_stat_statements`: en el stack local el ACL conserva `SELECT` para `PUBLIC`. Una variante temporal que omitía solo esa aserción falló después porque el reset local no tiene la función ni el event trigger `ensure_rls`, y por ello no habilitó RLS en la tabla sintética. La variante también confirmó que `graphql_public.graphql` es ejecutable por ambos roles en local. El bloque fallido se revirtió: no quedó la relación ni función probe. Estos objetos/grants locales administrados no se alteraron. Las comprobaciones equivalentes de metadatos y sonda en el Cloud nuevo niegan acceso privado; la suite local completa no se considera aprobada.

## Objetivos de recuperación propuestos

No se fijan metas RPO/RTO para el trabajo de desarrollo. La cobertura de backup, objetivos RPO/RTO y presupuesto quedan pendientes de acordar con el cliente antes de la entrega a producción; no son requisitos previos para reconstruir y probar este entorno de desarrollo. Cuando se acuerden, medirlos contra el plan y la cobertura reales.

Supabase documenta backups diarios automáticos para proyectos Pro, Team y Enterprise; en el plan gratuito recomienda exportaciones propias. Los backups de base de datos no incluyen el contenido de objetos de Storage. La clonación database-only incluye los datos de Auth, pero requiere volver a configurar manualmente Auth, claves API, Storage, Realtime, extensiones y otros ajustes. Verificar el plan y la cobertura real de este proyecto en lugar de asumir que esas funciones están habilitadas.

Referencias: [Backups de base de datos de Supabase](https://supabase.com/docs/guides/platform/backups), [Restaurar en un proyecto nuevo](https://supabase.com/docs/guides/platform/clone-project), [Backup y restore con CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Procedimiento de recuperación y contención previo a la entrega

1. Mantener un baseline completo y las migraciones ordenadas en el repositorio, sin credenciales. Identificar qué configuración de Auth/Storage y otros servicios requiere configuración fuera del esquema SQL.
2. Para validar CHG-00, ejecutar sus aserciones y las sondas HTTP con objetos sintéticos en una base local/aislada. Los ACL de vistas cuyo propietario es `supabase_admin` se reportan como administrados y no se alteran desde el rol de migración; las aserciones de la aplicación siguen verificando privilegios efectivos y RLS.
3. Verificar grants efectivos de REST/RPC, RLS/policies cuando existan objetos y visibilidad GraphQL como roles cliente. No tratar HTTP 200 como prueba de acceso y no consultar filas privadas.
4. Inyectar un fallo controlado dentro del bloque de prueba y confirmar el rollback, la ausencia de los objetos sintéticos y que el historial contiene `20261021041426` y `20261021043648`. La instalación limpia de toda la base comercial se ensaya en CHG-03, coordinado con CHG-06.
5. Registrar comandos, resultado, duración y límites de cobertura. No importar ni preservar filas de `ooytnnqxlxxgyenrutky` ni ejecutar reset en el proyecto remoto.
6. Antes de producción, acordar con el cliente plan, cobertura de backup, custodio, objetivos RPO/RTO y presupuesto, y después realizar un ensayo de restauración apropiado para ese entorno.

## Reensayo local verificado y procedimientos pendientes

El proceso de Codex no pudo abrir el pipe de Docker Desktop, por lo que el ensayo se hizo desde PowerShell externo. El registro real es `C:\Users\oscar\Documents\GraceSupply-Logs\chg00-verification-20261021-234618.log` (23:46:23-23:47:31). El script confirmó Docker disponible, reconstruyó solo `project_id=jewel-sales-hub` con `supabase db reset --local --no-seed --yes`, aplicó y reconoció las migraciones `20261021041426` y `20261021043648`, y pasó la suite SQL.

El mismo registro confirma API local disponible; REST read/insert y RPC denegados con HTTP 401 para `anon` y HTTP 403 para `authenticated`; GraphQL read/mutation respondió HTTP 200 sin marcadores sintéticos para ambos roles; PostgreSQL confirmó que no se insertaron filas y que el fixture permaneció intacto. La limpieza confirmó la eliminación de tabla, función y usuario sintéticos. No se usó `--linked`, no se tocó el proyecto Cloud y no se modificaron roles internos.

**Separación de alcance:** la seguridad local quedó verificada por el ensayo anterior. En Cloud, la evidencia de privilegios efectivos y pruebas SQL/GraphQL sintéticas sigue siendo la de `docs/chg-00-new-project-evidence.md`; no representa una prueba HTTP del gateway Cloud. La prueba HTTP remota a `qazjfofpfcwopcefupjl` continúa pendiente por falta de clave publishable local.

El ensayo cubrió la reconstrucción de desarrollo y el rollback sintético de CHG-00. No se ensayó una restauración real desde backup ni la recuperación separada de Auth, Storage o configuración de plataforma. La cobertura, RPO/RTO y presupuesto de producción siguen pendientes de acordar antes de entrega; esos ensayos no bloquean las tareas de desarrollo ya verificadas.

Ante un project ref distinto, datos no sintéticos inesperados o indicios de que otra aplicación comparte el proyecto, detenerse y pedir una decisión de alcance. Este procedimiento no contempla reset completo, DROP/TRUNCATE, eliminación de datos ni eliminación de identidades Auth.

## Contención temporal de CHG-00

`supabase/legacy-migrations/20261020120000_chg00_anonymous_containment.sql` conserva la migración histórica para las seis tablas del proyecto anterior; no se ejecuta sobre el destino nuevo. La migración versionada nueva cierra el acceso a `public`, las vistas de estadísticas y los defaults de `postgres`. `graphql_public` sigue teniendo un entry point ejecutable, pero el catálogo no registra `pg_graphql` como extensión instalada; la aplicación no lo usa y la sonda efectiva no expuso la relación sintética a ningún rol cliente. No se intentó retirar ACL propiedad de `supabase_admin`. `authenticated` permanece cerrado sobre `public` hasta que CHG-04/05 defina grants explícitos.
