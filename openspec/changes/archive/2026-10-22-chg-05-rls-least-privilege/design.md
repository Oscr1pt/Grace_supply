# Design

## Context

Ver `proposal.md` y Findings 1/3/9 del roadmap. Los dos SQL locales crean políticas FOR ALL USING (true); `auth.tsx` expone permisos por módulo como estado cliente y `_app.tsx` solo protege navegación. CHG-00 conserva la evidencia histórica del proyecto anterior; el nuevo proyecto `qazjfofpfcwopcefupjl` y su URL MCP aún deben verificarse antes de cualquier inspección remota. Las políticas, grants, funciones y vistas del nuevo destino no se consideran observados por esa auditoría anterior.

## Goals / Non-Goals

**Goals:** denegación por defecto, identidad Auth vigente, matriz verificable de operaciones/filas/columnas y ejecución mínima de funciones.

**Non-Goals:** crear identidades o administrar contraseñas (CHG-04), definir la transacción de negocio (CHG-07), agregar multi-tenancy no existente o interpretar acceso admin como bypass de base.

## Decisions

### Matriz propuesta para una sola empresa

El código no define tenant_id ni propietario de negocio por fila. Se propone alcance de una sola empresa: un permiso de módulo autoriza filas del módulo, no todas las tablas; no inventar aislamiento por creador que oculte historial compartido. Anónimo y revocado tienen **denegación total** sobre datos privados, incluidas funciones y vistas. Admin activo ve datos de negocio y administra mediante endpoints permitidos, nunca contraseñas ni bypass de constraints.

| Recurso | Empleado activo: lectura/filas | Empleado: mutación | Admin activo |
| --- | --- | --- | --- |
| Perfil propio | solo su perfil sin secretos/roles editables | ninguna de rol, permiso o estado | administración privada CHG-04; directorio mínimo |
| clients | módulo clients: filas del negocio; sales: proyección id/name/status | CRUD con clients; borrado solo sin historial, luego FK | mismo control de integridad |
| suppliers | módulo suppliers: filas del negocio | CRUD con suppliers; sin borrado de historial | mismo control de integridad |
| inventory | inventory: catálogo completo; sales/purchases: lookup de ID/SKU/nombre/precio público/stock, sin costos privados para sales | metadatos con inventory; stock solo operación autorizada | stock por operación, no parche libre |
| sales y futuras sale_lines | sales o clients: historial comercial necesario; sin acceso a compras/gastos | contabilizar con sales por RPC CHG-07; no UPDATE/DELETE directo | misma ruta transaccional; anulación CHG-08 |
| purchases | purchases o suppliers: historial necesario | contabilizar con purchases por RPC CHG-07 | misma ruta transaccional |
| client_credits | clients: todos los créditos de clientes; sales: solo resultado mínimo de venta propia de la operación | abonos con clients por RPC; creación ligada a venta con sales | mismas operaciones |
| supplier_credits | suppliers: créditos de proveedores; purchases: resultado mínimo de su compra | pagos con suppliers por RPC; creación ligada a compra con purchases | mismas operaciones |
| credit_payments | clients para tipo client; suppliers para tipo supplier; nunca ambos por un solo permiso | solo RPC de abono/pago, sin DML directo | mismas operaciones |
| expenses | expenses: filas del negocio | crear/editar gasto vigente con expenses, sin DELETE; anulación solo admin en CHG-08 | edición vigente y anulación controlada |
| settings | settings: configuración; sales: proyección autorizada de negocio/moneda para recibo | solo admin modifica ajustes del negocio; ningún empleado por mera lectura | actualización verificada CHG-01 |
| dashboard | dashboard: agregados expresamente autorizados, sin descargar tablas completas | ninguna | agregados y lectura de negocio |
| Auditoría futura | ninguna | ninguna directa | consulta restringida; inserción solo sistema CHG-08 |
| Idempotencia/mapeo interno futuro | estado mínimo de operación autorizado al actor, sin listar claves ajenas | ninguna directa | administración técnica restringida, no DML desde cliente |

La matriz propone privilegios concretos para aprobación, no describe permisos desplegados. Accesos indirectos de lectura para vender/comprar se limitan a proyecciones: las políticas de filas por sí solas no ocultan columnas. Usar grants por columna o consultas/vistas/RPC acotadas con seguridad verificada para no dar SELECT completo de clientes/inventario. El dashboard no hereda automáticamente acceso a los detalles financieros.

### Fuente de autorización protegida

CHG-04 provee perfil por auth.uid(), estado activo y permisos. RLS usa esa fuente en cada statement; los helpers no aceptan usuario o rol arbitrario. Evitar recursión sobre tablas de roles mediante helper pequeño y revisado con propietario controlado y rutas fijas. User metadata y objeto del navegador nunca conceden permiso. Revocación/cambio de permiso aplica en la siguiente operación aunque el JWT siga vigente.

### RLS, grants y funciones

Inventariar objetos expuestos y permisos efectivos; retirar políticas abiertas y grants sobrantes, habilitar RLS por operación y usar USING para filas existentes y WITH CHECK para nuevas versiones. Ninguna regla permite sustituir identidad, rol o campos protegidos. Negar privilegios por defecto a nuevos objetos y ejecución PUBLIC/anon de funciones privadas; considerar esquemas, secuencias, vistas, triggers y joins/relaciones embebidas.

Funciones SECURITY INVOKER cuando basten; donde se necesite SECURITY DEFINER para impedir DML directo, propietario dedicado sin login y privilegios mínimos, search_path fijo, referencias cualificadas, sin SQL dinámico del cliente, verificación auth.uid()/activo/permiso dentro de la función antes de acceder a filas. La función de negocio nunca concede service_role al llamante. Verificar vistas como invoker o exponer una proyección controlada que aplique idéntica autorización. Ninguna credencial privilegiada en bundle.

Antes de CHG-07, DML financiero/stock que pueda eludir atomicidad queda cerrado aunque el cliente heredado deje de funcionar. CHG-05 define la frontera; CHG-07 agrega operaciones y pruebas para habilitarla. DELETE financiero se deniega desde este cambio; CHG-08 dará anulación y retirará acciones destructivas del cliente. Gastos vigentes usan grants de campos editables y no admiten cambiar autor/fecha de creación; CHG-08 completará evidencia inmutable y motivo de anulación.

Alternativas descartadas: permiso frontend, política amplia para authenticated, claims de rol editables o política abierta como puente de despliegue.

## Risks / Trade-offs

- [Bloqueo de ventas por lookups restringidos] → pruebas de proyecciones mínimas; no ampliar tablas completas.
- [Definer/vista bypassa políticas] → revisión de propietario, rutas y ejecución con tokens insuficientes, incluso llamadas directas.
- [Funciones financieras todavía ausentes] → mantener esos flujos cerrados hasta CHG-07, documentando disponibilidad por fase.
- [Tabla nueva olvida permisos] → default deny y prueba de matriz en cada migración posterior.
- [Admin pierde acceso] → bootstrap/recuperación de CHG-04 y CHG-00 fuera de banda, nunca anon como rescate.

## Migration Plan

Requiere CHG-00, baseline CHG-03 y contrato de identidad CHG-04. Preparar una implementación por vez; la activación es conjunta CHG-04/05. El flujo compartido crea identidades sintéticas sin acceso, instala políticas/grants, retira el mecanismo legacy y valida el cliente Auth antes de habilitar operaciones privadas.

Ejecutar matriz en Supabase local o un proyecto aislado con datos sintéticos: anon, empleado sin permisos, sales, cada módulo, admin y revocado con token anterior. Para cada recurso probar SELECT/INSERT/UPDATE/DELETE y EXECUTE aplicables, cambio de IDs/campos protegidos, tipo de crédito incorrecto, proyecciones, consultas embebidas y objeto nuevo. Comprobar al menos una operación permitida y una denegada por celda relevante; resultado vacío sin fixture visible no demuestra seguridad. Capturar solo resultados redactados.

Salida conjunta exige todas las denegaciones y permisos esperados, sin políticas globales USING (true), grants o funciones que reabran acceso. Rollback: cerrar tráfico y recuperar release Auth/RLS validada; si no existe, mantenimiento seguro. No restaurar las políticas antiguas. Las operaciones futuras se habilitan solo al satisfacer la matriz.

## Decisiones que requieren aprobación

Matriz por módulos, alcance compartido de empresa, proyecciones mínimas, ajustes solo admin, acceso de gastos y auditoría, y periodo de indisponibilidad de operaciones aún sin RPC. CHG-04/05 se habilitan juntos; confirmar project ref antes de pruebas remotas.

## Matriz mínima acordada para diseño

Los permisos se modelarán por módulo, operación y rol y se validarán en PostgreSQL mediante RLS y mecanismos de servidor confiables. Anónimo: sin acceso a datos privados. Administrador activo: gestiona los módulos del negocio y empleados dentro de las operaciones permitidas. Empleado activo: registra ventas y consulta inventario; gestiona clientes solo cuando tenga permiso explícito de módulo/operación autorizado. Compras, gastos, administración de cuentas/empleados, modificaciones de precios y anulaciones quedan denegadas por defecto al empleado y permitidas solo al administrador activo. Ninguna concesión del frontend sustituye estas reglas. El detalle por columna/fila seguirá aplicando mínimo privilegio; RLS, grants, vistas y RPC se revisarán juntos.

