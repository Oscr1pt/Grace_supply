# CHG-00: verificación inicial del proyecto nuevo

**Fecha:** 2026-10-21  
**Destino previsto:** `qazjfofpfcwopcefupjl`  
**Conexión MCP:** `supabase-grace-v2-write`  
**Alcance:** comprobación de configuración real, metadatos remotos y sonda sintética reversible. No se leyeron filas de negocio ni quedaron objetos de prueba.

## Identidad

La configuración efectiva de MCP en `C:\Users\oscar\.codex\config.toml`, sección `[mcp_servers.supabase-grace-v2-write]`, usa `https://mcp.supabase.com/mcp?project_ref=qazjfofpfcwopcefupjl&features=database`. El ref coincide exactamente con el destino nuevo autorizado. La conexión anterior `ooytnnqxlxxgyenrutky` se conserva únicamente como antecedente histórico en `docs/chg-00-containment-evidence.md`.

La configuración local de `.env` también se cambió para apuntar a `https://qazjfofpfcwopcefupjl.supabase.co`; las claves heredadas del proyecto anterior se vaciaron. El MCP disponible no proporciona la clave publishable del proyecto nuevo, por lo que la app no debe conectarse hasta que esa clave se obtenga desde el panel correcto y se configure localmente.

## Estado inicial (antes de la migración)

El inventario inicial no mostró relaciones comerciales ni migraciones aplicadas. Encontró defaults permisivos de `postgres` para objetos futuros en `public`, permisos `PUBLIC` de lectura en las dos vistas de estadísticas y `EXECUTE`/`USAGE` para clientes en `graphql_public`. `public.rls_auto_enable` era `SECURITY DEFINER`, propiedad de `postgres` y asociada al event trigger `ensure_rls`. La conexión no era miembro de `supabase_admin` y no podía cambiar ACL concedidos por ese rol.

El listado de extensiones distingue disponibles de instaladas: `pg_graphql` aparece disponible con `installed_version: null`, y no hay fila `pg_extension` para ella. Por tanto, no se debe describirla como una extensión instalada. La función `graphql_public.graphql` sí existe, pertenece a `supabase_admin`, es SECURITY INVOKER, no tiene dependencia catalogada de una extensión y concede `USAGE`/`EXECUTE` a `anon` y `authenticated`.

## Migración de seguridad y estado actual

`supabase/migrations/20261021041426_chg00_new_project_containment.sql` se aplicó y permanece registrada en el destino como versión `20261021041426` (`chg00_new_project_containment`). No se reescribió ni se cambió su historial. La prueba de RPC reveló que el default por esquema no quitaba `EXECUTE` global de `PUBLIC`; se agregó y aplicó la migración compatible `20261021043648_chg00_revoke_public_function_defaults.sql`. Las dos versiones permanecen registradas con esos identificadores. La migración histórica del proyecto anterior permanece en `supabase/legacy-migrations/` y no se aplicó al proyecto nuevo.

La primera migración cerró `USAGE` de `public` para `anon` y `authenticated`, retiró sus permisos de las dos vistas de estadísticas, revocó `EXECUTE` de `public.rls_auto_enable` y quitó defaults permisivos de `postgres` para tablas y secuencias y los defaults directos por esquema para funciones. La segunda migración retiró el default global `EXECUTE` de `PUBLIC` para funciones futuras creadas por `postgres`, porque el ACL por esquema no puede revocar ese default global. Las comprobaciones actuales confirman los controles; `service_role` conserva los permisos previstos. El historial actual contiene exactamente las versiones `20261021041426` y `20261021043648`.

Los grants a `anon` y `authenticated` en `graphql_public` continúan porque el ACL es propiedad de `supabase_admin`; una respuesta HTTP 200 no se usó como señal de exposición de datos. El código de la aplicación no contiene uso de GraphQL. La extensión `pg_graphql` no está instalada como extensión de base de datos, así que `DROP EXTENSION` no aplica. El MCP no es propietario de la función ni puede eludir la autoridad de `supabase_admin`; no se alteraron roles internos ni se intentó hacerlo.

## Verificaciones efectivas

- **REST:** `anon` y `authenticated` tienen `USAGE=false` en `public`; el inventario no contiene tablas/vistas comerciales en `public` o `graphql_public`. La sonda directa con roles cliente denegó SELECT e INSERT en la relación sintética. Los esquemas internos `auth` y `storage` sí tienen `USAGE`: las tablas `auth` no conceden CRUD a esos roles; las tablas `storage` conceden privilegios de tabla, pero tienen RLS activado, no tienen políticas y los roles cliente no tienen `BYPASSRLS`, lo cual produce denegación por defecto. No se leyeron filas. `pgrst.db_schemas` no aparece en los ajustes consultables de base/rol, así que no se afirma la lista de esquemas publicados ni se ejecutó una llamada HTTP REST.
- **RPC:** no hay RPC de aplicación persistentes en `public`; `public.rls_auto_enable` devuelve `EXECUTE=false` para ambos roles. Antes del ajuste, la prueba detectó `EXECUTE=true` heredado de `PUBLIC` en una función sintética nueva; después de aplicar la segunda migración, la prueba deniega su invocación como ambos roles. Las vistas `extensions.pg_stat_statements` y `extensions.pg_stat_statements_info` devuelven `SELECT=false` para ambos roles. No se puede certificar qué esquemas internos publica el gateway REST/RPC porque su lista configurada no es accesible desde esta conexión.
- **REST:** bajo `SET ROLE anon` y `SET ROLE authenticated`, SELECT e INSERT directos de la relación sintética fueron denegados por PostgreSQL. El proyecto aún no contiene recursos comerciales. No se ejecutó una llamada HTTP al gateway porque falta clave publishable y la lista de esquemas PostgREST no se pudo confirmar por SQL.
- **GraphQL:** el entry point puede ejecutarse por ambos roles, pero es SECURITY INVOKER. La sonda creó tabla, fila y función estrictamente sintéticas dentro de un subbloque que se revirtió; verificó RLS habilitado y ausencia de `SELECT/INSERT/UPDATE/DELETE` efectivos para ambos roles. Bajo `SET ROLE anon` y `SET ROLE authenticated`, intentó consultas y mutaciones GraphQL; ninguna respuesta reveló la fila sintética ni confirmó una escritura. La introspección tampoco mostró los campos de esa relación. La sonda pasó y no se tomó HTTP 200 como prueba de acceso.
- **Prueba repetible:** `supabase/tests/chg00_containment.sql` contiene las aserciones anteriores. Se ejecutó en el proyecto nuevo después de ambas migraciones y pasó (respuesta vacía de error). La sonda no cambió las migraciones registradas ni dejó la tabla o función sintéticas.

Una desactivación de GraphQL reduciría superficie porque la aplicación no la usa, pero el objeto presente es una función administrada propiedad de `supabase_admin`, no una extensión instalada; no se intentó borrarla ni modificar sus grants con una conexión sin esa autoridad. No se identificaron dependencias de aplicación. Si Grace Supply requiere que el endpoint desaparezca, el ajuste debe evaluarse desde configuración administrativa soportada y con sus dependencias verificadas.

## Límites y pendientes

No se ejecutaron llamadas HTTP REST, RPC o GraphQL con clave publishable del nuevo proyecto porque no está configurada localmente. Los chequeos de permisos de PostgreSQL y la sonda GraphQL se ejecutaron en el destino correcto, pero no son una prueba de disponibilidad HTTP del API gateway. El proyecto permanece sin esquema comercial; la reconstrucción completa corresponde a CHG-03 coordinado con CHG-06. La instalación limpia local se ejecutó, pero la suite local falló por grants del stack local descritos abajo y en `docs/chg-00-recovery-plan.md`.

## Ensayo local reproducible (2026-10-21)

Antes del reset se verificó `project_id = "jewel-sales-hub"`, ausencia de `supabase/.temp/project-ref`, el contenedor activo `supabase_db_jewel-sales-hub` y que no existían contenedores Supabase de otros proyectos. Se ejecutó solo `npx.cmd --yes supabase db reset --local --no-seed --yes --workdir C:\\Users\\oscar\\jewel-sales-hub`; no se usó `--linked`. El reset terminó satisfactoriamente y aplicó `20261021041426` y `20261021043648`. La lista `migration list --local` confirma ambas versiones y el inventario local muestra cero relaciones comerciales y ausencia del probe. Cloud no se reseteó ni se modificó en este ensayo.

La suite `supabase/tests/chg00_containment.sql` **falló** en su aserción de `pg_stat_statements`: en el entorno local `anon` y `authenticated` tienen `SELECT=true` por un ACL de `PUBLIC` concedido por `supabase_admin`. Una copia temporal que omitió solo esa aserción también **falló** porque el reset local no tiene la función ni el event trigger `ensure_rls`, así que RLS no se activa en la relación sintética. El catálogo local muestra `graphql_public.graphql` ejecutable (`true`) por ambos roles, con objeto propiedad de `supabase_admin`; `public` no tiene `USAGE` para los clientes y no contiene RPC o tablas. El rol migrador local `postgres` no es superusuario. No se intentó asumir ni modificar roles/ACLs internos. El bloque sintético fallido se revirtió y se confirmó ausencia de tabla y función probe. En Cloud, las consultas de metadatos comprobaron `SELECT=false` en estadísticas, `USAGE=false` en public, RPC de mantenimiento denegado y la sonda GraphQL no reveló lectura/escritura; no se interpreta HTTP 200 como permiso de datos. La divergencia local impide declarar reproducible/pasada la suite completa y bloquea CHG-00.

## Reensayo local verificado (2026-10-21 23:46)

**Fuente:** transcript de PowerShell `C:\Users\oscar\Documents\GraceSupply-Logs\chg00-verification-20261021-234618.log` (inicio 23:46:23, fin 23:47:31; PowerShell 5.1). Esta es evidencia del Supabase local `jewel-sales-hub`; no es evidencia HTTP de Cloud.

- Docker Engine estuvo disponible. El transcript muestra la invocación del verificador y su finalización sin excepciones. El script ejecuta `supabase db reset --local --no-seed --yes` y aborta ante código distinto de cero; luego informa que ambas migraciones (`20261021041426`, `20261021043648`) están presentes en el historial local.
- `supabase/tests/chg00_containment.sql`: aserciones SQL de CHG-00 pasaron. La prueba usa una relación sintética con RLS explícito y fuerza rollback del subbloque de prueba; confirma que la relación y la función no persisten.
- El API gateway local respondió. REST read, REST insert y RPC respondieron HTTP 401 como `anon`, y HTTP 403 como `authenticated`; el script verificó que no se devolvieran los marcadores sintéticos.
- GraphQL read y mutation devolvieron HTTP 200 como ambos roles. Las respuestas no incluyeron marcadores sintéticos y la aserción posterior en PostgreSQL confirmó que la relación conservaba solo la fila sintética inicial, sin escrituras no autorizadas.
- El bloque de limpieza verificó la eliminación de la tabla, función y usuario Auth sintéticos; el transcript termina con `Local CHG-00 verification finished: checks passed; temporary SQL resources and Auth user removed.`
- No se alteraron grants ni roles internos de Supabase. Los ACL administrados que no pertenecen al rol de migración no se modificaron.

## Alcance Cloud y límites

Las comprobaciones remotas de identidad, migraciones, privilegios efectivos y sonda GraphQL en `qazjfofpfcwopcefupjl` son la evidencia separada documentada arriba: metadatos SQL y pruebas sintéticas bajo `anon`/`authenticated`. No se ejecutó una llamada HTTP REST/RPC/GraphQL al gateway Cloud porque no hay una clave publishable nueva configurada. Los HTTP 401/403/200 anteriores pertenecen exclusivamente al API local.

El reensayo local supera los fallos del primer intento descritos en la sección histórica anterior. La reconstrucción integral del esquema comercial sigue fuera de CHG-00 y corresponde a CHG-03 coordinado con CHG-06.

