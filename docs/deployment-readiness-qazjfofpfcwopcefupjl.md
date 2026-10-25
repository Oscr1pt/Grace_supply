# Grace Supply — auditoría de preparación para Supabase Cloud

**Fecha:** 2026-10-22  
**Destino previsto:** proyecto `qazjfofpfcwopcefupjl`  
**Rama local:** `feature/database-remediation`  
**Alcance:** inspección local y de Supabase local. No se consultó ni modificó Supabase Cloud.

## Dictamen

> Actualización CHG-10 (2026-10-23): ver el [addendum de readiness](chg-10-deployment-readiness-addendum.md), que reemplaza el estado previo de seed/bootstrap y registra las evidencias actuales. El dictamen vigente es **NO LISTO PARA CLOUD**; ninguna operación remota fue autorizada o ejecutada.

**No listo para despliegue todavía.** El historial local y los artefactos OpenSpec están completos, pero hay gates de seguridad/operación antes de cualquier `db push` o despliegue de Functions:

1. Las auditorías repetidas para CHG-02 detectaron **19 vulnerabilidades en el árbol completo (6 críticas, 9 altas, 4 moderadas)** y **16 en producción (5 críticas, 7 altas, 4 moderadas)**. La crítica de TanStack Start es XSS reflejado sin autenticación. Esta auditoría posterior sí actualiza paquetes más abajo; ver el resultado final en “Resultado CHG-02”.
2. No hay procedimiento ejecutable y revisado para crear el **primer administrador** de un proyecto Cloud vacío. El Change exige bootstrap confiable fuera del registro público, pero `manage-profile` requiere un admin activo y las migraciones no crean identidades. No activar provisioning hasta resolver este círculo de arranque mediante un runbook de un solo uso, controlado, revisado y verificable.
3. `supabase/config.toml` activa seeds y apunta a `./seed.sql`, pero `supabase/seed.sql` no existe. Resolverlo o desactivar seeds explícitamente tras confirmar el procedimiento de reconstrucción limpia; no usar datos comerciales ficticios como seed.
4. No hay historial remoto de migraciones verificable en esta auditoría y no existe `supabase/.temp/project-ref`. El `.env` local apunta al ref previsto, pero eso no prueba la identidad del proyecto enlazado por la CLI ni el estado real de la base Cloud.
5. La política tributaria no está aprobada. La contabilización de ventas permanece bloqueada por diseño. No habilitarla con la tasa cero usada exclusivamente en fixtures locales.
6. Recovery/provisioning Cloud siguen deshabilitados hasta verificar SMTP transaccional y URLs/orígenes. Hay una excepción pendiente para empleados sin correo individual.

El informe es un artefacto local nuevo. No se ha creado commit, rama auxiliar ni se ha hecho staging.

## Repositorio y OpenSpec

- Rama observada: `feature/database-remediation`.
- Git contiene cambios locales sin commit: **62 rutas tracked modificadas/eliminadas** y **110 archivos untracked** (el `status --short` agrupa directorios untracked). Hay cambios en app, SQL, pruebas, scripts, documentación, archivos OpenSpec archivados y especificaciones sincronizadas. El conteo incluye todos esos trabajos; no se debe usar `git add -A` a ciegas.
- `.env` está ignorado y no está versionado. No se imprimieron sus valores. No se encontró la referencia del proyecto anterior en código/configuración activa; la referencia histórica aparece solo en documentación de auditoría histórica.
- Ocho Changes están archivados: CHG-00, CHG-01, CHG-03, CHG-04, CHG-05, CHG-06, CHG-07 y CHG-08. No hay Changes activos. Todos los `tasks.md` archivados tienen todas sus tareas marcadas (CHG-00: 7; cada otro Change: 3). CHG-02 no forma parte de estos ocho Changes.
- `openspec validate --archived --strict`: **8/8 pasaron**. `openspec validate --specs --strict`: **8/8 pasaron**. `openspec validate --changes --strict` informó “No items found” porque ya no hay Changes activos; no lo contamos como validación de los archivos archivados.
- Las ocho especificaciones principales correspondientes existen bajo `openspec/specs/` y pasaron validación estricta.

### Estrategia para preservar y consolidar Git

1. Mantener intacta la rama actual y capturar un inventario antes de staging: `git status --short`, `git diff --check`, `git diff --stat`, y revisar untracked con `git ls-files --others --exclude-standard`. Conservar una copia local de seguridad o ref de protección antes de empezar a preparar commits.
2. Revisar y stagear por grupos explícitos, con `git add <rutas>` o `git add -p`; nunca incluir `.env`, archivos temporales de pruebas, logs, `.temp`, claves ni artefactos generados. En cada grupo revisar `git diff --cached --stat` y `git diff --cached`.
3. Mantener juntos los pares de archivo borrado de `openspec/changes/<change>` y su destino en `openspec/changes/archive/<fecha>-<change>`; incluir la sincronización de `openspec/specs/` y evidencia del mismo Change, para que el commit no pierda la trazabilidad.
4. Separar commits coherentes: (a) contención/schema/migraciones y contratos; (b) Auth/RLS/Edge Functions; (c) RPC financieros/auditoría y pruebas PostgreSQL; (d) adaptación del cliente/cache y pruebas de navegador; (e) archivos archivados, specs sincronizadas y evidencia. Ajustar la separación si `git diff` revela dependencias que exigen mantener rutas juntas.
5. Después de cada commit revisar `git status`, `git show --stat --oneline HEAD` y comparar las migraciones en el commit con el inventario de este informe. No alterar migraciones ya aplicadas.

La auditoría no ejecutó esa estrategia ni creó commits, para dejar la decisión de consolidación al dueño del repositorio.

## Migraciones y reproducibilidad

### Inventario activo, en orden CLI

| Orden | Versión | Change | Resumen |
|---:|---|---|---|
| 1 | `20261021041426` | CHG-00 | Contención del proyecto nuevo |
| 2 | `20261021043648` | CHG-00 | Revoca defaults públicos de funciones |
| 3 | `20261022000000` | CHG-03/06 | Esquema relacional versionado |
| 4 | `20261022190000` | CHG-04 | Perfiles enlazados a identidades Auth verificadas |
| 5 | `20261022191000` | CHG-05 | Roles, grants, RLS, vistas de lookup |
| 6 | `20261022193000` | CHG-04 | Exige identidad confirmada al activar perfil |
| 7 | `20261022200000` | CHG-05 | Protege campos sensibles de inventario |
| 8 | `20261022200500` | CHG-05 | Corrige guard SECURITY DEFINER de inventario |
| 9 | `20261022201000` | CHG-05 | Lectura mínima de identidad de perfil |
| 10 | `20261022202000` | CHG-05 | IDs estables para inserts permitidos |
| 11 | `20261022210000` | CHG-04 | Incidencias recuperables de compensación Auth |
| 12 | `20261022220000` | CHG-07 | RPC financieros atómicos e idempotentes |
| 13 | `20261022221000` | CHG-07 | Ajuste de stock de venta |
| 14 | `20261022230000` | CHG-08 | Auditoría financiera y anulaciones |
| 15 | `20261022231000` | CHG-08 | RPC de gastos y auditoría correspondiente |

Las dependencias siguen el orden base CHG-00 → CHG-03/06 → CHG-04/05 → CHG-07 → CHG-08. El catálogo `supabase_migrations.schema_migrations` del PostgreSQL local contiene **las 15 versiones en ese orden**. Las pruebas y los documentos de CHG-03/06 registran reconstrucciones locales desde cero, comparación de firmas entre reconstrucciones, rollback y contrato SQL. La suite de integración final CHG-08 registra 20/20 casos PostgreSQL/Auth, 10/10 navegador, 21/21 pruebas generales, TypeScript, build y validación OpenSpec antes de archivar.

`supabase/legacy-migrations/20261020120000_chg00_anonymous_containment.sql` está fuera de `supabase/migrations/` y **no pertenece a la secuencia instalable**. Conservarlo como evidencia histórica; no moverlo ni aplicarlo al destino. No se reescribieron migraciones en esta auditoría.

**Historial Cloud:** desconocido/no verificado. No se consultó Cloud. Antes de aplicar, inspeccionar el historial y las diferencias del proyecto destino mediante una sesión explícitamente enlazada al ref aprobado. No asumir que las 15 versiones faltan o están aplicadas; detenerse ante versiones desconocidas, divergencias o drift. La versión PostgreSQL local configurada es 17; confirmar que el proyecto destino soporta y usa una versión compatible.

**Seed:** `db.seed.enabled = true`, `sql_paths = ["./seed.sql"]`, archivo inexistente. Aunque el flujo Cloud previsto es aplicar migraciones y no resetear, el estado actual impide afirmar que el procedimiento de reconstrucción que incluye seed sea reproducible. El despliegue de migraciones no requiere que se inventen filas de negocio.

## Supabase Edge Functions y secretos

Hay tres Functions desplegables y un módulo compartido que se incluye al desplegar cada función:

| Function | `verify_jwt` local | Propósito y controles | Secretos/variables esperadas |
|---|---|---|---|
| `username-login` | `false` | Resuelve username a identidad activa y verificada; hace sign-in Auth y devuelve sesión con respuesta genérica. Endpoint público por diseño. | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (las variables estándar de plataforma deben verificarse en runtime). |
| `username-recovery` | `false` | Recovery Auth oficial; respuesta genérica 202 para reducir enumeración; bloqueado salvo flag. | Las anteriores, `ACCOUNT_RECOVERY_ENABLED=false`, `APP_PUBLIC_ORIGIN`, `APP_ALLOWED_ORIGINS`. |
| `manage-profile` | `true` | Verifica JWT y admin activo; invitación, cambios, revocación y reparación de incidencias; provisioning bloqueado salvo flag. | Las anteriores, `ACCOUNT_PROVISIONING_ENABLED=false`, `APP_PUBLIC_ORIGIN`, `APP_ALLOWED_ORIGINS`. |

`_shared/http.ts` define CORS; no se despliega como Function independiente. Las funciones usan `SUPABASE_SERVICE_ROLE_KEY` desde su entorno servidor para Auth Admin/operaciones de servicio. Debe mantenerse como secreto de Edge Function (o sustituirse por el mecanismo de secret key soportado si el código se actualiza), jamás en `VITE_*`, `NEXT_PUBLIC_*`, bundle, navegador o logs. Las variables de plataforma automáticas deben confirmarse tras despliegue; la documentación actual de Supabase distingue claves `publishable`/`secret` y conserva nombres heredados, así que no presumir que una clave nueva es compatible solo por su nombre. [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)

Los endpoints de login y recovery desactivan verificación JWT por ser invocados antes de autenticación. CORS no es autorización: ambos siguen siendo accesibles por clientes fuera de los orígenes permitidos. Antes de activarlos, probar throttling/WAF/rate limits, abuso de username y límites de Auth/email. Login hace una consulta de perfil privilegiada antes de cada intento; el flujo depende de la respuesta genérica y del rate limit de Auth, y no se encontró un rate limiter propio delante de esa búsqueda.

## RLS, grants, funciones, vistas y acceso privilegiado

Comprobado directamente mediante consultas de solo lectura al Supabase **local**:

- 17 tablas públicas con RLS habilitado. No hay `FORCE ROW LEVEL SECURITY`; el propietario puede omitir RLS, mientras que los roles de aplicación están gobernados por grants/policies. `anon` no tiene `USAGE` del esquema `public`; `authenticated` lo tiene, sin privilegio `CREATE`.
- Las policies se asignan a `authenticated`; no hay policies `anon`. Los registros de auditoría, compensación, reversos y operaciones financieras se exponen como lectura según rol/policy o solo a funciones; `business_operations` y `provisioning_incidents` no tienen policies de cliente. INSERT/UPDATE/DELETE financieros directos no se conceden; las escrituras usan RPC. `clients` y `suppliers` permiten DELETE directo a usuarios con el permiso correspondiente; revisar aceptación de borrado de datos maestros y conservación de referencias antes de producción.
- Hay 20 funciones `SECURITY DEFINER` bajo `public`/`private`; todas observadas tienen `search_path` explícito fijado a `pg_catalog` más esquemas requeridos. `anon` no tiene EXECUTE. Los RPC financieros necesarios tienen EXECUTE solo para `authenticated`; helpers internos no son invocables directamente. Hay 115 restricciones locales entre PK/FK/UNIQUE/CHECK/otros objetos de constraint; los documentos CHG-03/06 cubren montos, saldos, referencias, stock y precisión `NUMERIC(14,2)`.
- Las cinco vistas son propiedad de `postgres`, tienen `security_barrier=true` y **`security_invoker=false`**. Corren con permisos del propietario y no aplican RLS base como el usuario invocador; la reducción depende de filtros explícitos `private.has_permission(...)` o `private.is_active_admin()`. `security_barrier` mitiga reordenamientos de predicados, pero no es una policy RLS. La matriz de CHG-05 registra 21 escenarios locales con Auth real para permisos por vista/rol. Mantener definiciones/propietario y repetir esos casos como prueba post-despliegue; un cambio en filtros o propietario sí sería un gate de seguridad.
- Los guards de append-only y eliminación histórica permiten explícitamente `service_role` (y el propietario de base es privilegiado). Auditoría protege contra usuarios de app, no contra un operador dueño de proyecto con acceso de mantenimiento. Restringir miembros del proyecto, rotación/custodia de claves, acceso a Dashboard y export/backup; no dar claves privilegiadas al cliente.
- Las vistas/objetos internos de `extensions`, GraphQL y ACLs administrados tienen límites documentados en CHG-00. No alterar objetos propiedad de `supabase_admin` ni intentar “limpiarlos” sin soporte de plataforma y evidencia del gateway.

## Frontend, endpoints, caché y dependencias

- La configuración local `.env` tiene URL con host/ref `qazjfofpfcwopcefupjl.supabase.co`. `VITE_SUPABASE_ANON_KEY` está en formato `sb_publishable_`; no se imprime ni se prueba contra Cloud. `NEXT_PUBLIC_SUPABASE_URL` apunta al mismo ref y `NEXT_PUBLIC_SUPABASE_ANON_KEY` está vacío. Verificar desde el dashboard autorizado que la publishable key local pertenece al proyecto correcto antes de construir. Mantener una sola fuente (`VITE_*`) y no inyectar `service_role`/secret key.
- La búsqueda de referencias al antiguo ref no encontró URLs del proyecto anterior en código activo o configuración activa. La referencia anterior solo se mantiene en documentos históricos. El cliente no contiene variables nombradas `SERVICE_ROLE`/`SECRET`; sus únicas referencias están en Edge Functions, fixtures y scripts de test local.
- Riesgo de caché privada **cerrado por CHG-09**: las filas de negocio ya no se hidratan ni persisten en `localStorage`; las claves antiguas `lustre_*` solo se eliminan durante limpieza y en pruebas de regresión. La sesión Auth se mantiene separada por pestaña y la caché React se invalida ante cambios de identidad/permisos. Ver evidencia en `docs/chg-09-session-cache-isolation-evidence.md`; conservar las claves heredadas únicamente para retirar residuos de versiones previas.
- `package.json` y `package-lock.json` están modificados y también existe `bun.lock`. El proyecto no declara `packageManager`, los scripts y auditorías usan npm y no hay ejecutable Bun; este Change conserva npm como la instalación soportada y registra `bun.lock` como lock no activo, sin reescribirlo.

### Resultado npm audit inicial de CHG-02

Fecha de consulta del registro: 2026-10-22. `npm audit` informó 19 paquetes vulnerables (6 critical/9 high/4 moderate); `npm audit --omit=dev` informó 16 (5/7/4). Los nombres directos se muestran con **D** y los demás son transitivos. Las versiones instaladas vienen del lock inicial. Los parches que se indican son el mínimo seguro conocido o el candidato compatible consultado; la resolución final se confirma contra el lock y el audit posterior.

| Paquete | Instalado | Severidad / advisory y rango afectado | Parche candidato | Exposición observada |
|---|---|---|---|---|
| **D** `@tanstack/react-start` | 1.168.42 | Critical, GHSA-qx66-fv34-fjm8; `>=1.143.12 <1.168.60` | Parche 1.168.60; actualización coordinada a 1.169.4 | Server functions de TanStack Start en SSR/Worker; una navegación maliciosa puede reflejar HTML/JS en origen. |
| `@tanstack/react-start-rsc` | 0.1.41 | Critical, Start/RSC chain | >=0.1.59; candidato 0.1.65 | Server rendering. |
| `@tanstack/react-start-server` | 1.167.30 | Critical, Start server chain | >=1.167.46; candidato 1.167.52 | Endpoint SSR/server functions. |
| `@tanstack/start-plugin-core` | 1.171.33 | Critical, Start plugin/server chain | >=1.171.49; candidato 1.171.55 | Toolchain que genera server functions. |
| `@tanstack/start-server-core` | 1.169.25 | Critical, GHSA-qx66-fv34-fjm8; `<1.169.39` | >=1.169.39; candidato 1.169.45 | Server functions en runtime. |
| **D** `@cloudflare/vite-plugin` | 1.51.1 | Moderate, vía Miniflare/Wrangler | 1.64.0; requiere Wrangler >=4.151 y admite Vite 8 | Adaptador local/build de Cloudflare Workers. |
| **D** `nitro` | 3.0.260603-beta | Moderate, `3.0.1-alpha.0`–`3.0.260610-beta` vía env-runner | 3.0.260903-beta (npm lo marca cambio mayor/prerelease sensible) | Parte del toolchain de servidor/Worker; confirmar contenido de bundle. |
| **D** `vite` | 7.3.6 | High; GHSA-9jrq-w75r-8gcw, GHSA-rq7h-c2jc-7f22 y advisories de launch-editor; `7.0.0`–`7.3.6` | 8.3.5, coordinado con Start 1.169.4 | Middleware/dev server; no asumir que el issue solo afecta build estático. Exposición de desarrollo solo si se publica el dev server. |
| **D** `wrangler` | 4.120.0 | Moderate vía Miniflare | >=4.151; plugin candidato fija 4.151.0 | Herramienta de dev/deploy, no una función Supabase. |
| `miniflare` | 5.20260801.1-alpha; nested 4.20260730.0 | High vía `sharp`/`undici`; el rango alcanza `5.20260926.0-alpha` | Plugin 1.64 trae 5.20261012.0-beta; actualizar/eliminar nested vulnerable mediante el árbol compatible | Runtime simulado/build Workers. Tratar como expuesto hasta comprobar el grafo generado. |
| `env-runner` | 0.1.16 | Moderate, `0.1.7`–`0.1.16` | Actualizar mediante Nitro 3.0.260903-beta | Dependencia del toolchain Nitro. |
| `js-yaml` | 4.3.1 | High, GHSA-2883-xcg3-v3hh; `4.0.0`–`4.3.1` | 4.3.2, sin cambiar major | Parseo YAML transitivo de herramientas. |
| `launch-editor` | 2.14.1 | High: GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-587h-7wmj-h5pm; `<=2.14.1` | 2.14.2 | Integración de error overlay/dev server; riesgo en entorno de desarrollo. |
| `seroval` | 1.6.2 | High, GHSA-jp82-f5mq-hwhp; `<=1.6.2` | >=1.6.3; candidato 1.7.0 | Serialización SSR/transitiva. |
| `sharp` | 0.35.2 | High, GHSA-rgj7-g3m4-5g8c y GHSA-wq5f-xc86-pv6w/CVE-2026-96889; `<0.35.5` | 0.35.5 estable o posterior compatible | Transformación de imágenes/build; validar si llega al Worker. |
| `source-map-js` | 1.2.1 | High, GHSA-68fv-2mgg-jv7q; `<1.2.2` | 1.2.2 | Parseo de source maps en toolchain. |
| `brace-expansion` | 5.0.9 y 1.1.18 (dos rutas; una bajo `@typescript-eslint/typescript-estree`) | High, GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p; versiones afectadas según rama <5.0.12 / <1.1.21 | 5.0.12 y 1.1.21 por su árbol compatible | Expansión de patrones durante tooling/tests; riesgo DoS de CPU/stack. |
| `shell-quote` | 1.10.0 | Critical, GHSA-pqg4-j6r4-53mv; `>=1.8.4 <1.11.0` | >=1.11.0; candidato 1.12.0 | Herramienta transitiva de desarrollo; no se encontró referencia en runtime de negocio. |
| `undici` | 7.28.0 y 7.29.0 | High, 15 GHSA: desync/splitting, cache/cookie leaks, CRLF, TLS bypass y DoS; rangos terminan en `<7.29.0` o `<7.29.1` | >=7.29.1; candidato 7.30.1, manteniendo major 7 | Cliente HTTP en toolchain/servidor; revisar si incluido en Worker output. |

La auditoría no equivale por sí sola a una SBOM final del Worker: npm incluye dependencias de tooling y peers, y las superficies de Vite/Miniflare son distintas del SSR publicado. Por el uso de TanStack Start con SSR en Cloudflare, la exposición de la cadena Start es directa; el riesgo Vite/launch-editor es de un servidor de desarrollo expuesto; para Nitro/undici/sharp/Miniflare se requiere inspeccionar bundle y conservar como riesgo potencial hasta demostrar que no se despliegan. `npm audit fix --dry-run` falló con ERESOLVE al intentar resolver Start 1.169.4 contra Vite 7.3.6; confirmó que la actualización debe ser coordinada y no se usó `--force`.

GHSA-qx66-fv34-fjm8 fue comprobado en el aviso oficial de TanStack: afecta a requests de server function sin autenticar y fija `@tanstack/react-start` en 1.168.60, `@tanstack/start-server-core` en 1.169.39; el aviso describe ejecución de JavaScript del atacante en el origen cuando la víctima abre un enlace. La documentación actual de Cloudflare confirma TanStack Start sobre Workers/Vite y que su plugin necesita alinearse con la configuración Vite/Worker. Referencias: [advisory TanStack](https://github.com/TanStack/router/security/advisories/GHSA-qx66-fv34-fjm8), [guía Cloudflare TanStack Start](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/), [lanzamiento Nitro 3.0.260903-beta](https://github.com/nitrojs/nitro/releases/tag/v3.0.260903-beta).

## Configuración Cloud que hará falta

### Proyecto Supabase de desarrollo

- Confirmar organización, proyecto y ref visualmente en Dashboard con dos verificaciones independientes de `qazjfofpfcwopcefupjl`; confirmar región, versión de PostgreSQL (17 compatible), estado de backups/PITR, límites y dominio/API.
- Mantener **registro email público apagado**, sign-in anónimo apagado, confirmación de correo obligatoria, cambio seguro de contraseña habilitado, rate limits adecuados, límites de envío y CAPTCHA/controles antiabuso si corresponde. Auth local tiene confirmaciones y cambio seguro desactivados; no copiar esos flags a Cloud.
- Definir `Site URL` como el dominio HTTPS aprobado del frontend. Permitir únicamente los redirect URLs exactos necesarios, al menos la ruta de reset aprobada (`/reset-password`) y el flujo de invitación; evitar comodines amplios. La URL de sitio es el fallback para los enlaces Auth y la allowlist valida los `redirectTo`. [Supabase Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- Configurar SMTP transaccional verificado, dominio remitente, SPF/DKIM/DMARC, límites, reputación, plantillas de invitación/confirmación/reset, prueba de entrega, caducidad/uso único de enlaces y monitorización. SMTP predeterminado de Supabase está limitado y no es apropiado para producción. [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- Cargar los secretos solo en Supabase Function secrets: credencial de servicio compatible con el código, `APP_PUBLIC_ORIGIN`, `APP_ALLOWED_ORIGINS` (orígenes exactos), y flags `ACCOUNT_PROVISIONING_ENABLED` / `ACCOUNT_RECOVERY_ENABLED` inicialmente `false`. Confirmar qué variables Supabase inyecta automáticamente antes de configurar manualmente.
- Mantener migraciones y Edge deployment como pasos separados. Funciones públicas `username-login` y `username-recovery` se publicarán con verify JWT desactivado según contrato; `manage-profile` mantiene verify JWT activado. Probar Authorization dentro del código incluso con el gateway activado.
- Crear el primer admin únicamente con procedimiento confiable, temporal y auditado; posteriormente cerrar/inutilizar bootstrap. Cuentas de empleado solo con correo individual verificado. Los empleados sin correo individual permanecen bloqueados hasta decisión aprobada.

La configuración de URL/SMTP no se puede derivar de archivos locales: el dominio final de aplicación y los datos del proveedor SMTP aún deben ser entregados/aprobados.

## Procedimiento controlado propuesto (futuro; no ejecutado)

1. **Aprobaciones y resguardo:** aprobar este plan, el proyecto exacto, operadores, ventanas y rollback. Confirmar backup/PITR y probar restauración. Congelar la rama, guardar estado actual con commits revisados y etiquetar el conjunto que se desplegará.
2. **Gates del código:** resolver vulnerabilidades; elegir lockfile; ejecutar TypeScript, build, suites general/PostgreSQL/Auth/Mailpit/Playwright y `openspec validate --archived --strict` más `--specs --strict`. Confirmar ningún secreto en `dist`/source maps y que `VITE_*` apunta solo al proyecto destino.
3. **Reproducibilidad aislada:** en un stack Supabase local desechable separado, aplicar las 15 migraciones desde cero, resolver config/seed, ejecutar scripts de autorización/contrato y repetir pruebas. No resetear el stack local actual que contiene el estado existente.
4. **Preparar destino:** entrar al Dashboard autorizado y verificar dos veces el ref destino. Con aprobación posterior, enlazar CLI explícitamente al ref. Antes de cualquier escritura remota, revisar `migration list`/historial, drift, extensiones, PG major y roles/privilegios de la base. Parar si existe migración desconocida o esquema no esperado; no reparar con `db reset`.
5. **Despliegue DB controlado:** después de aprobación específica, simular/diff de migraciones, obtener revisión de un segundo operador, backup inmediato y aplicar migraciones incrementales en ventana de dev. No editar una migración aplicada; agregar una nueva migración correctiva. Mantener SMTP/recovery/provisioning y operaciones de venta bloqueados en esta etapa.
6. **Post-migración:** comprobar 15 versiones esperadas, tablas/constraints, RLS/grants, funciones y `search_path`, cinco vistas y privilegios; correr sondas `anon`, empleado sin permiso, empleado permitido, admin y revocado con identidades sintéticas. Comprobar ausencia de cuentas/datos reales inesperados.
7. **Functions/Auth:** desplegar las tres Functions después del paso DB; revisar `verify_jwt`, CORS exacto y secretos desde el Dashboard sin imprimirlos. Bootstrap del admin con el runbook revisado. SMTP y redirect en estado de prueba; verificar invitación, login username, reset válido/inválido, expiración, enumeración genérica, revocación y límites. Solo habilitar recovery/provisioning mediante flags tras pruebas satisfactorias.
8. **Cliente y smoke test:** construir con URL y publishable key verificadas. Hacer pruebas de aislamiento de caché entre usuarios, autorización desde API y UI, errores/timeouts y reconciliación. Mantener ventas bloqueadas mientras falte política tributaria; probar solamente flujos no fiscales aprobados.
9. **Cierre:** conservar logs no sensibles, IDs de despliegue, versiones y aprobaciones; cotejar SQL final y migraciones; confirmar backups/alertas. Para rollback, preferir forward-fix; restaurar backup solo con autorización y plan de impacto de datos.

Ningún paso de este procedimiento se ha iniciado contra Cloud.

## Pruebas de aceptación posteriores al despliegue

| Área | Aceptación requerida |
|---|---|
| Identidad del destino | Ref exacto, región y PG major revisados por dos personas; sin enlace accidental al proyecto anterior. |
| Migraciones | 15 versiones en orden, esquema esperado, sin drift/inconsistencias; restore de backup demostrada. |
| Anon/RLS | `anon` no puede enumerar ni leer/escribir datos; sin privilegios `CREATE`/RPC accidental. |
| Empleado | Permitido solo para su matriz de funciones; joins/vistas no filtran columnas/filas extra; cambio de rol/ID y token revocado se deniegan. |
| Admin y revocación | Bootstrap único revisado; provisioning solo por admin; cuenta revocada pierde REST/RPC/Edge pese a token no expirado. |
| Vistas/RPC | Las 5 vistas devuelven solo datos por permiso. RPC financieros autorizan actor, bloquean llamadas directas, mantienen atomicidad/idempotencia y rechazado en todos los accesos no autorizados. SECURITY DEFINER sin search_path inseguro ni EXECUTE público. |
| Auditoría | Evento durable con actor/fecha/operación; app no puede insertar/cambiar/borrar historial; fallo del trigger revierte la operación; anulaciones/reversos son autorizados e idempotentes. |
| Auth correo | Entrega SMTP comprobada; URLs allowlisted exactas; token válido/expirado/reutilizado; recuperación genérica; no se revela correo; signup público sigue desactivado. |
| Cliente | Login, formularios, errores SQL/desconexión/timeouts, respuestas fuera de orden, reconciliación por UUID, caché aislada por identidad y cero éxitos falsos/duplicados. |
| Secreto/build | Bundle, source maps, `dist`, HTML y tráfico del navegador contienen solo la publishable key; no `service_role`/secret key ni credenciales SMTP. |
| Negocio | Ventas no se contabilizan hasta aprobar tax/rounding; compras/pagos/anulaciones se prueban solo con reglas aprobadas y datos sintéticos. |

## Decisiones y bloqueos que requieren aprobación

### Necesarias para un despliegue de desarrollo

1. Confirmar el proyecto Cloud destino/ref y aprobar el operador/ventana/backup. El informe no consultó el ref remoto ni historial.
2. Aprobar y documentar el procedimiento de primer administrador, custodio de `service_role`, política de accesos Dashboard y recuperación de incidentes de provisioning.
3. Proveer dominio HTTPS de desarrollo, allowlist exacta de redirects y política SMTP de prueba. Mantener flags de recovery/provisioning apagados hasta validar entrega.
4. Resolver lockfile/16 findings de producción, comprobar actualización no rompe build/tests y ejecutar auditoría completa de dependencias.
5. Resolver `seed.sql` ausente y hacer reproducción limpia en stack local aislado.
6. Mantener sales/RPC fiscalmente dependientes bloqueadas mientras no se apruebe política tributaria. El desarrollo puede validar migraciones, identidad y seguridad con fixtures; no debe simular una regla productiva.
7. Decidir si clientes/empleados podrán borrar clientes/proveedores directamente o si se requiere archivo lógico y retención.

### Necesarias antes de entregar el sistema al cliente

- Tasa tributaria y jurisdicción; si el precio incluye impuestos; fórmula por línea/subtotal; orden, precisión y reglas de redondeo; emisión y tratamiento fiscal de anulaciones. Sin esto, ventas quedan bloqueadas.
- Retención, expiración y purga de claves idempotentes.
- Tratamiento de caja/transferencia/tarjeta/cheque al anular, devoluciones efectivas, anulaciones parciales y reversos parciales; periodos de corrección/cierre, razón requerida y aprobaciones por monto.
- Política para mercancía no devuelta o no revendible, retención/export/custodia de auditoría, backups, logs y revisiones de acceso.
- Excepción de cuenta para empleados sin correo individual (sigue pendiente); no activar recuperación alternativa insegura.
- Dominio de producción, proveedor SMTP productivo y verificación de entrega/entregabilidad, soporte y respuesta ante incidente.

Estas decisiones no se pueden deducir ni implementar en una auditoría técnica.

## Evidencias locales revisadas

- [Evidencia CHG-00](chg-00-new-project-evidence.md), [plan de recuperación](chg-00-recovery-plan.md)
- [Evidencia CHG-03](chg-03-versioned-schema-evidence.md), [evidencia CHG-06](chg-06-db-integrity-evidence.md)
- [Matriz CHG-05](chg-05-authorization-matrix.md), [decisión Auth](chg-04-recovery-decision.md)
- [Evidencia CHG-07](chg-07-local-evidence.md), [evidencia CHG-08](CHG-08-financial-audit-evidence.md)
- Consultas locales directas al catálogo PostgreSQL ejecutadas en esta auditoría: migraciones, flags RLS/policies, grants, vistas y owners, RPC/SECURITY DEFINER, `search_path` y ejecución por roles.
- `npm audit --omit=dev --audit-level=moderate --json`: 16 vulnerabilidades, comando termina con exit code 1 por hallazgos; sin cambios de dependencias.
- OpenSpec strict archivados: 8/8; specs sincronizadas: 8/8.

## Resultado CHG-02 — remediación de dependencias (2026-10-22)

### Dependencias y auditoría

- Coordinación directa resuelta: `@tanstack/react-start` **1.169.4**, `@tanstack/react-router` **1.170.46**, `@tanstack/router-plugin` **1.168.48**, `@cloudflare/vite-plugin` **1.64.0**, `vite` **8.3.5** y `nitro` fijado en **3.0.260903-beta**. React permanece en la línea **19.2.x**.
- La resolución transitiva actual fija `@tanstack/start-server-core` **1.169.45**, `@tanstack/start-plugin-core` **1.171.55**, `@tanstack/react-start-server` **1.167.52** y `@tanstack/react-start-rsc` **0.1.65**; Cloudflare trae Wrangler/Miniflare actualizados.
- Transitivos corregidos: `brace-expansion` **1.1.21 / 5.0.12**, `js-yaml` **4.3.2**, `launch-editor` **2.14.2**, `shell-quote` **1.12.0**. El resto de findings baseline desaparecieron con sus padres compatibles.
- Resultado final: `npm audit` **0 vulnerabilidades** y `npm audit --omit=dev` **0 vulnerabilidades**. GHSA-qx66-fv34-fjm8 queda corregido por la actualización de TanStack Start y `start-server-core`; su impacto baseline era XSS reflejado no autenticado en respuestas de server functions.
- El registry confirma que `@lovable.dev/vite-tanstack-config@2.26.7` también declara el peer opcional exacto `nitro: ">=3.0.260603-beta"`; no hay una versión publicada compatible con Nitro 3.0.260903-beta. El proyecto usa el paquete en `vite.config.ts` para TanStack Start, Vite y Cloudflare, así que eliminarlo alteraría el build. La solución local mínima conserva los archivos runtime de la versión bloqueada **2.7.7** y cambia únicamente el peer range a `>=3.0.260603-beta || >=3.0.260903-beta`; el motivo y límites están en `vendor/lovable-vite-tanstack-config/README.md`. Se regeneró el lockfile con `npm install --ignore-scripts`, sin `--force`, `--legacy-peer-deps` ni overrides en esta corrección. `npm ls` quedó limpio y `npm ci --dry-run --ignore-scripts` pasó.
- Las instalaciones avisaron que no se ejecutaron scripts de instalación de `esbuild@0.28.2` y `workerd@1.20261012.1`; TypeScript, build Worker y regresiones locales sí corrieron. No se autorizaron esos scripts por separado.

### Regresión ejecutada

| Verificación | Resultado |
|---|---|
| `npx tsc --noEmit` | Pasó. |
| `npm test` | Pasó: 21 pruebas, 0 fallos. |
| `npm run build` | Pasó para cliente, SSR y bundle de Cloudflare/Nitro. Vite/Rolldown emite avisos de tamaño de chunk y directivas `use client`; no bloquean build. |
| `npm run test:business:local` | Pasó: **20/20** escenarios PostgreSQL reales, incluidos concurrencia, idempotencia, rollback, auditoría, anulaciones y reconciliación. URL verificada como loopback. |
| `npm run test:browser:local` | Pasó: **10/10** escenarios Playwright sobre Supabase local, incluidos login, permisos, formularios, ventas/compras, denegaciones, timeout y reconciliación. |
| `tests/security.integration.test.mjs` con Auth/RLS y Edge Functions locales | **22/22**, dos ejecuciones completas; los tres escenarios reparados también pasaron aislados en orden inverso. Incluye `username-login`, `username-recovery` y `manage-profile`. |
| OpenSpec estricto | `validate chg-02-dependency-security-remediation --strict` pasó; `validate --changes --strict` pasó (1/1). El Change no se archivó. |

Los tres escenarios se corrigieron sin tocar permisos: el gasto ahora prueba rechazo de INSERT directo y persistencia por RPC autorizado; el guard del último administrador corre con otros admins temporalmente desactivados dentro de una transacción PostgreSQL que siempre termina en `ROLLBACK`; la prueba de revocación prepara el administrador y lo restaura en `finally`. El actor que contabiliza gastos es el admin sintético fijo, de modo que las auditorías inmutables no retienen nuevas cuentas temporales. Cleanup elimina identidades temporales; si una FK de auditoría impide borrar un actor anterior, la cuenta se revoca y el evento histórico se conserva. Se revocaron seis cuentas sintéticas huérfanas de ejecuciones previas, preservando sus eventos de auditoría; no quedaron gastos de fixture activos. Se ejecutaron las tres pruebas focalizadas en orden inverso y dos suites completas **22/22**, sin contaminación adicional.

La compilación de Cloudflare y la suite Playwright validan la aplicación después del cambio de toolchain, pero no equivalen a desplegar las Edge Functions. Las tres funciones locales comprobadas por las pruebas de seguridad son `username-login`, `username-recovery` y `manage-profile`; no hubo despliegue remoto.

### Estado de seguridad para despliegue

El bloqueo por **advisories npm críticos/altos/moderados** está resuelto según el registro consultado (cero hallazgos full y producción). El peer range local está corregido y validado por `npm ls`, instalación de lock en dry-run, build Worker, pruebas financieras y navegador. CHG-02 cumple sus seis subtareas y puede archivarse después de revisión. Esto no declara listo el despliegue Cloud: el plan Cloud aún conserva los bloqueos del informe principal. Ninguna migración, Edge Function o recurso Supabase Cloud fue modificado.

