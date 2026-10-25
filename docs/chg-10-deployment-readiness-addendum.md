# CHG-10 — Readiness de despliegue

**Fecha:** 2026-10-23
**Proyecto previsto:** `qazjfofpfcwopcefupjl`
**Dictamen:** **NO LISTO PARA CLOUD** hasta completar gates locales y obtener autorización específica para inspección/deploy remoto.

Este addendum reemplaza las afirmaciones anteriores del informe principal sobre seed inexistente, reconstrucción y falta de runbook bootstrap. No aporta evidencia sobre el estado real de Cloud.

## Evidencia local verificada

### Resultado verificado de CHG-10

Dictamen actualizado: **preparacion local comprobada; Cloud no listo y no autorizado**. Dos reconstrucciones independientes pasaron las 15 migraciones, el contrato SQL y la comparacion reproducible de esquema/ACL: `94354ae2d2425a4e39a4d382a09e82a97b1adf1a9481990286da47e6a366e6a9`. Se normalizaron unicamente los meta-comandos aleatorios `\\restrict` y `\\unrestrict` de PostgreSQL 17.

Resultados en el primer stack descartable: bootstrap Auth/Mailpit **1/1**; operaciones financieras **20/20**; Auth/RLS/Edge Functions **22/22**; Playwright **17/17**. Todas las suites pasaron. El stack temporal y sus fixtures fueron retirados; el contenedor `supabase_db_jewel-sales-hub` habitual permanecio activo y no fue reseteado.

Las pruebas de recovery/provisioning y fault-injection usaron flags exclusivamente en el `[edge_runtime.secrets]` del proyecto temporal; no se modificaron flags para Cloud. El `.env` temporal no contenia credenciales, y fue eliminado con el workdir.

- `supabase/config.toml` deja el seed explícitamente deshabilitado (`enabled=false`, `sql_paths=[]`). No se crea un seed comercial. La revisión de las migraciones no encontró dependencia de filas de negocio sintéticas; el singleton fijo de `settings` se inicializa por migración.
- Se inventariaron 15 migraciones, ordenadas desde `20261021041426` hasta `20261022231000`. La migración legacy `20261020120000_chg00_anonymous_containment.sql` queda fuera de `supabase/migrations`.
- `supabase/tests/chg10_rebuild_contract.sql` verifica historial, 17 tablas, RLS, restricciones, cinco vistas `security_barrier`, privilegios anon, RPC sensibles, singleton requerido y ausencia de usuarios/perfiles/filas comerciales.
- `scripts/chg10-local-verify.ps1` usa project IDs Docker únicos, workdirs bajo temp, puertos separados y comprueba el contenedor destino antes de resetear. Ejecuta dos reconstrucciones independientes y compara un dump de esquema con ACL; la huella y los resultados observados se registran en este informe.
- El harness financiero/de seguridad recibe `LOCAL_SUPABASE_CONTAINER` en vez de fijar el nombre del stack habitual. No se usa ningún wrapper que resetee ese stack.

## Bootstrap del primer administrador

El procedimiento operator-only está en [first-admin-bootstrap.md](first-admin-bootstrap.md). Las plantillas `supabase/bootstrap/first-admin-create.sql` y `first-admin-activate.sql` quedan fuera de las migraciones. Un operador invita con Supabase Auth, registra el UUID y ejecuta SQL Editor en contexto confiable: la primera transacción exige perfiles vacíos y crea el perfil admin inactivo; tras verificar la confirmación Auth del mismo UUID, la segunda transacción permite activarlo. Advisory lock y precondiciones bloquean duplicados y reutilización. Un fallo de inserción se reanuda con la misma identidad Auth.

La prueba local usa Mailpit, Auth local y un contenedor descartable: prueba fallo parcial y rollback, reanudación, carrera de dos intentos, perfil inactivo, rechazo de activación previa a confirmar, invitación/confirmación, activación y rechazo de otro administrador. Guardar resultado sin tokens ni enlaces. La ejecución en Cloud requerirá autorización aparte y acciones manuales del propietario en Dashboard/SQL Editor.

## Inventario de configuración

| Área | Requerido | Estado seguro inicial |
|---|---|---|
| Migraciones | 15 locales, en orden; comparar historial remoto | Inspección remota pendiente |
| Edge Functions | `username-login` (`verify_jwt=false`), `username-recovery` (`false`), `manage-profile` (`true`); `_shared/http.ts` acompaña cada deploy | Ninguna desplegada por CHG-10 |
| Frontend | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Únicas credenciales públicas admitidas |
| Flags frontend | `VITE_ACCOUNT_PROVISIONING_ENABLED`, `VITE_ACCOUNT_RECOVERY_ENABLED` | `false` |
| Secretos runtime Edge | Plataforma: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; propios: `APP_PUBLIC_ORIGIN`, `APP_ALLOWED_ORIGINS` | service role solo servidor; orígenes HTTPS exactos |
| Flags Edge | `ACCOUNT_PROVISIONING_ENABLED`, `ACCOUNT_RECOVERY_ENABLED` | `false` |
| Auth | signup público y anonymous sign-in apagados; confirmación obligatoria; Site URL HTTPS y redirects exactos de invitación y `/reset-password` | Dominio/URLs requieren decisión y verificación |
| SMTP | host, puerto, usuario, contraseña, sender, SPF/DKIM/DMARC, plantillas, límites y entrega | Proveedor y sender pendientes; secretos no se guardan aquí |
| Protección | backup/PITR y restore comprobado, operadores Dashboard, claves y política de recuperación | Pendiente de aprobación |

Producción es otro entorno y requiere URL, claves, Auth, SMTP, dominios, backups y datos separados. Mantener ventas bloqueadas hasta aprobación explícita de tasa, inclusión de impuestos, fórmula y redondeo.

## Preflight remoto futuro — no ejecutado

Esta fase es exclusivamente de consulta y requiere autorización específica para conectar y consultar `qazjfofpfcwopcefupjl`. Esa autorización no habilita escrituras, cambios de configuración, migraciones ni despliegues. Sin ella no se ejecuta ninguno de los comandos de esta sección.

1. Confirmar con el propietario en Dashboard que el proyecto abierto muestra exactamente el ref `qazjfofpfcwopcefupjl`, organización y etiqueta de desarrollo; detenerse si la identidad o el propósito no coinciden. No abrir producción.
2. Comprobar estado/pausa y existencia de objetos o datos. Usar el panel de estado y estas consultas `SELECT` de catálogo; no devolver filas comerciales ni PII. El ref se confirma visualmente en Dashboard, ya que SQL no acredita la identidad del proyecto.

```sql
select current_database(), current_user;
select n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname not in ('pg_catalog', 'information_schema') and c.relkind in ('r','p','v','m')
order by n.nspname, c.relname;
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies order by schemaname, tablename, policyname;
select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema in ('public','private') order by grantee, table_schema, table_name, privilege_type;
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private') order by n.nspname, p.proname;
```

Conteos exactos de presencia, sin leer valores comerciales:

```sql
select 'clients' as table_name, count(*) from public.clients union all
select 'suppliers', count(*) from public.suppliers union all
select 'inventory', count(*) from public.inventory union all
select 'sales', count(*) from public.sales union all
select 'sale_lines', count(*) from public.sale_lines union all
select 'purchases', count(*) from public.purchases union all
select 'client_credits', count(*) from public.client_credits union all
select 'supplier_credits', count(*) from public.supplier_credits union all
select 'credit_payments', count(*) from public.credit_payments union all
select 'expenses', count(*) from public.expenses union all
select 'settings', count(*) from public.settings union all
select 'user_profiles', count(*) from public.user_profiles union all
select 'provisioning_incidents', count(*) from public.provisioning_incidents union all
select 'business_operations', count(*) from public.business_operations union all
select 'financial_audit_events', count(*) from public.financial_audit_events union all
select 'financial_compensations', count(*) from public.financial_compensations union all
select 'payment_reversals', count(*) from public.payment_reversals;
select count(*) as auth_identity_count from auth.users;
```

No sacar conclusiones de “vacío” si faltan tablas, la consulta falla o existen datos no explicados; detenerse y elevarlo al propietario.
3. Revisar `supabase/migrations/` y su orden local. Solo tras confirmar el ref, enlazar explícitamente el CLI y leer el historial:

```powershell
supabase link --project-ref qazjfofpfcwopcefupjl
supabase migration list --linked
```

4. Comparar las versiones y el orden local/remoto. Ante versión desconocida, ausencia inesperada, divergencia o base no vacía sin clasificar, detenerse. Para diferencias de esquema, ejecutar la inspección sin `--file` para no generar una migración; revisar grants, RLS, políticas, funciones y vistas con consultas `SELECT` de catálogo.

```powershell
supabase db diff --linked
```

5. Solo si identidad, estado, historial y diferencias están explicados, solicitar autorización específica para simular migraciones. La simulación no aprueba escrituras:

```powershell
supabase db push --dry-run --linked
```

Guardar salida redactada de secretos y datos, ref observado, estado, versiones, diferencias, permisos, dry-run y condiciones de parada. `link` cambia el enlace local del CLI; verificar antes/después que quede seleccionado únicamente el ref aprobado. No ejecutar `db reset --linked`, `migration repair`, `db push` sin `--dry-run`, SQL de escritura, `secrets set`, creación/invitación de identidades ni `functions deploy`. La inspección requiere autorización remota de solo lectura; cualquier escritura posterior exige autorización nueva y explícita.


## Aceptación posterior y condiciones de parada

- Auth: invitación, confirmación, perfil inicialmente inactivo, activación, rechazo de signup público, recuperación conforme a flags y revocación efectiva.
- RLS: anon, empleado permitido/no permitido, admin y revocado en tablas/vistas/RPC/Edge; verificar funciones `SECURITY DEFINER`, search_path, grants y ausencia de claves privilegiadas en bundle/source maps.
- Caché: cambio entre usuarios/pestañas, refresh y arranque offline sin mostrar información de otra identidad.
- Finanzas: atomicidad, rollback, concurrencia, idempotencia y reconciliación por ID estable ante timeouts/fallos de transporte; sin reintento ciego ni éxito falso.
- Auditoría: actor/fecha, append-only, reversos/anulaciones autorizados, saldos consistentes y transacción revertida ante fallo de auditoría.
- Edge: JWT según función, CORS exacto, rate limits, errores genéricos y secretos solo server-side.

Detenerse ante ref incorrecto, historial divergente/desconocido, drift/datos inesperados, dry-run no revisado, backup/restore no probado, SMTP/HTTPS incompleto, grants/identidades inesperados, cache cross-user, transacción parcial, auditoría inconsistente o exposición de secreto. Sin política tributaria aprobada, las ventas permanecen bloqueadas.

## Verificaciones finales

| Verificacion | Resultado |
|---|---|
| Reconstruccion PostgreSQL limpia e independiente | 2/2; 15 migraciones; hash de esquema/ACL identico |
| Bootstrap Auth/Mailpit | 1/1 |
| Integracion financiera | 20/20 |
| Auth/RLS/Edge Functions | 22/22 |
| Playwright | 17/17 |
| `npm test` | 29 aprobadas, 0 fallidas; suites de integración de negocio, bootstrap y Auth/RLS aparecen omitidas deliberadamente sin flags locales |
| `tsc --noEmit` | Pasa |
| `npm run build` | Pasa; quedan avisos existentes de chunks/directivas de Vite/Rolldown |
| Bundle cliente | Sin credencial privilegiada ni marcador de variable service-role. El prefijo literal `sb_secret_` del SDK (detector de tipos de clave) no es una clave |
| OpenSpec `validate chg-10-cloud-deployment-readiness --strict` | Pasa |
| OpenSpec `validate --specs --strict` | 10/10 pasa |
| Cleanup | Sin contenedores ni carpetas `chg10run*`; stack local habitual sigue activo |
| OpenSpec `validate --archived --strict` | 11/11 Changes archivados pasan |
| CHG-10 | 9/9 subtareas; archivado en `2026-10-23-chg-10-cloud-deployment-readiness`; specs sincronizadas; validación estricta pasa |


### Suites omitidas por `npm test`

La omisión es intencional: el script estándar ejecuta `node --test tests/*.test.mjs`; las pruebas que necesitan Supabase local, Mailpit y credenciales de servicio solo se habilitan con `RUN_LOCAL_BUSINESS_INTEGRATION=1`, `RUN_LOCAL_BOOTSTRAP_INTEGRATION=1` y `RUN_LOCAL_SECURITY_INTEGRATION=1`. El harness `scripts/chg10-local-verify.ps1` crea un stack desechable, establece esos flags y ejecuta las suites, con evidencia indicada arriba (bootstrap 1/1, finanzas 20/20 y Auth/RLS 22/22). Estos skips no bloquean por sí mismos la inspección Cloud ni requieren relajar las protecciones de `npm test`; se debe volver a ejecutar el harness aislado tras cambios de migraciones, bootstrap o integración y ejecutar pruebas post-despliegue antes de habilitar usuarios o ventas.


## Git y autorizaciones pendientes

Rama `feature/database-remediation`: al inicio, 3 commits adelante y 1 detrás de origin; commit pendiente `b3a009d`. No se integra ni publica automáticamente. Se preservan los commits y archivos existentes; `.env`, `.bak` y `scripts/chg00-anon-probe.mjs` siguen excluidos. Las aprobaciones pendientes son: inspección remota, backup/ventana, dominio/redirects/SMTP, primer administrador y custodia, push de migraciones, deploy de Functions, y política fiscal. Este Change no archiva ni inicia el despliegue.
