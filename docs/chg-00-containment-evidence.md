# CHG-00 Containment Evidence (Development)

**Checked:** 2026-10-20  
**Branch:** `feature/database-remediation`  
**Scope:** read-only schema/security metadata through the `supabase-grace-ro` MCP connection, plus prior repository review and owner-provided context. No business rows, personal data, credentials, or secrets were queried; no database changes or behavioral probes were performed.

## Evidence status

| Classification | Finding | Evidence / limitation |
|---|---|---|
| Owner-confirmed context | Project ref `ooytnnqxlxxgyenrutky` is identified by the owner as the development project with disposable test data. | Not independently matched against the MCP connection: the available tools expose no project-ref/connection identity metadata. Do not treat the alias `supabase-grace-ro` as proof of the ref. |
| MCP discovery and connection | `supabase-grace-ro` tools are available in this session, and `list_tables` plus read-only catalog queries completed. | Available tools include `list_tables` and `execute_sql`. An initial catalog query had a SQL aggregation error; it was read-only and the corrected view query completed. |
| Observed remotely — schema | `public` contains six tables: `clients`, `inventory`, `purchases`, `sales`, `settings`, and `users`. | `list_tables` with verbose schema metadata; no row contents were read. The `users` table schema includes a `password` column; no values were queried. |
| Observed remotely — RLS | RLS is disabled and not forced on all six `public` tables. | `list_tables` and `pg_class` metadata. |
| Observed remotely — effective table privileges | Both `anon` and `authenticated` have effective SELECT, INSERT, UPDATE, and DELETE privileges on all six `public` tables. Both roles also have USAGE on `public` and `graphql_public`. | Read-only privilege/catalog checks (`has_table_privilege`, `has_schema_privilege`). These results, combined with disabled RLS, establish critical exposure risk; no anonymous data probe was performed. |
| Observed remotely — policies | No policies were returned by `pg_policies` for non-system schemas. | Read-only catalog metadata. |
| Observed remotely — views | No views were found in `public` or `graphql_public`. Three views exist elsewhere: `extensions.pg_stat_statements` and `extensions.pg_stat_statements_info` are SELECT-accessible to anon/authenticated; `vault.decrypted_secrets` is not SELECT-accessible to either. | View inventory and effective privilege metadata; view definitions and contents were not queried. |
| Observed remotely — functions/RPC | No functions or procedures were found in `public`. `graphql_public.graphql` exists and is executable by anon and authenticated. | Read-only routine metadata. No RPC or function was invoked. Other Supabase-managed schemas contain internal functions; their broad catalog privileges are not evidence that those schemas are REST-exposed. |
| Not verified | Anonymous REST behavior/denial, actual project-ref match, configured PostgREST exposed schemas, and whether the enabled anon grants are reachable through the API. | This run was restricted to security metadata; no data-row probe or API request was made. The project ref remains owner-confirmed only. |
| Reported antecedent | The remediation roadmap records earlier reported anonymous access and password exposure as urgent until containment is verified. | `docs/database-remediation-roadmap.md`; the original audit report is not present in the reviewed project files. |
| Observed locally | The reviewed migration files define permissive `FOR ALL USING (true)` policies for legacy objects `public.suppliers`, `public.client_credits`, `public.supplier_credits`, `public.credit_payments`, and `public.expenses`; browser code accesses `public.users`, including password comparison. | Local SQL and `src/lib/auth.tsx` are repository evidence only and do not establish the deployed state. These local object names differ from the six tables returned remotely. |

## Remote resource matrix

| Resource | RLS | Effective anon privileges | Effective authenticated privileges | Policies / related metadata |
|---|---|---|---|---|
| `public.clients` | Disabled; not forced | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE, DELETE | No policy returned |
| `public.inventory` | Disabled; not forced | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE, DELETE | No policy returned |
| `public.purchases` | Disabled; not forced | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE, DELETE | No policy returned |
| `public.sales` | Disabled; not forced | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE, DELETE | No policy returned |
| `public.settings` | Disabled; not forced | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE, DELETE | No policy returned |
| `public.users` | Disabled; not forced | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE, DELETE | No policy returned; schema includes a `password` column, values not accessed |
| `graphql_public.graphql` | Function; RLS not applicable | EXECUTE | EXECUTE | No invocation performed |

## Initial containment status (metadata-only review)

At that initial review, anonymous exposure was observed but effective REST accessibility was not verified. No changes were made, and remediation had not yet been authorized. This section records that historical state; the authorized follow-up is below.

## Verificación posterior (2026-10-20)

El propietario confirmó que `supabase-grace-dev-write` apunta a `ooytnnqxlxxgyenrutky`; la URL de `.env` contiene el mismo ref. Se trató ese destino como el proyecto de desarrollo autorizado para esta auditoría.

Las sondas usaron únicamente la clave publishable/anon y reportaron estados HTTP. Cada lectura REST seleccionó `id` con `limit=0`; PATCH y DELETE usaron un filtro centinela, `limit=0` y `Prefer: return=minimal`. No se devolvieron valores de filas ni se modificaron filas.

| Recurso | Lectura anónima | Sonda de actualización | Sonda de eliminación | Resultado |
|---|---:|---:|---:|---|
| `public.clients` | 200 | 204 | 204 | Accesible |
| `public.inventory` | 200 | 204 | 204 | Accesible |
| `public.purchases` | 200 | 204 | 204 | Accesible |
| `public.sales` | 200 | 204 | 204 | Accesible |
| `public.settings` | 200 | 204 | 204 | Accesible |
| `public.users` | 200 | 204 | 204 | Accesible |
| `graphql_public.graphql` (`{ __typename }`) | 200 | n/a | n/a | Accesible |

No se probó POST/INSERT: una inserción segura requiere fixtures específicos por tabla y una transacción que la API REST no ofrece. Los grants de catálogo confirman por separado que `anon` y `authenticated` tienen SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER y MAINTAIN en las seis tablas. Ambos roles también tienen USAGE en `public`; `graphql_public.graphql` es ejecutable por PUBLIC, anon, authenticated y service_role. No se encontraron vistas ni funciones RPC en `public`. El inventario informó cero filas en las seis tablas de la aplicación.

La migración preparada para la contención es `supabase/migrations/20261020120000_chg00_anonymous_containment.sql`. **No se ha aplicado**: el historial remoto de migraciones está vacío, el repositorio no tiene un baseline completo de instalación limpia y no se pudo ensayar una restauración local porque faltan los CLI de OpenSpec/Supabase y Docker Engine no está disponible. Esta es una precondición de recuperación pendiente, no evidencia de que la exposición esté contenida.

Las afirmaciones iniciales de estado no verificado describen la primera sesión de solo lectura y quedan reemplazadas por esta auditoría posterior. La tarea 1.1 está completa como inventario, prueba de acceso y documentación de contención. La exposición efectiva seguirá abierta hasta aplicar la migración de forma segura y comprobar que las sondas posteriores son denegadas.
