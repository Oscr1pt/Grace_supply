# Evidencia de integración local CHG-04 / CHG-05 / CHG-01

Fecha: 2026-10-22. Entorno: Supabase Auth, Edge Functions, Mailpit y PostgreSQL locales; esquema versionado CHG-03/06 y datos sintéticos. No se ejecutaron migraciones en Cloud ni se modificó el proyecto anterior.

## Resultado

`RUN_LOCAL_SECURITY_INTEGRATION=1 node --test tests/security.integration.test.mjs`: **22/22 pruebas pasaron**.

- Identidades sintéticas reales de Supabase Auth con perfiles vinculados a `auth.users`; fixtures conectan clientes, ventas, líneas, compras, créditos y pagos.
- Lecturas positivas verificadas en PostgreSQL por admin, `clients`, `sales`, `suppliers`, `purchases`, `expenses` e `inventory`; un empleado sin permisos y el usuario revocado no obtienen filas de otros módulos.
- CRUD positivo para clientes, proveedores, metadatos de inventario y gastos; denegaciones explícitas para anon, tablas financieras, vistas, perfiles, ajustes C/D, eliminación de inventario/gastos, columnas protegidas y joins de contactos.
- Vistas limitadas: recibos para sales, catálogo de inventario sin coste para ventas/compras, proveedores sin contacto para compras y coste de inventario solo para admin.
- Se probaron alteración directa de roles/permisos, gestión de empleados por usuario no admin, token revocado aún vigente, JWT expirado/forjado, registro público apagado y acceso RPC privado no expuesto.
- Invitación administrativa real: perfil comienza como empleado inactivo con permiso inicial mínimo; Auth no permite activarlo antes del correo confirmado; al confirmar una identidad sintética, admin activo puede activarla. El enlace de invitación llega a Mailpit y termina en `/reset-password`.
- Recuperación oficial de Auth: cuenta verificada recibe correo local con enlace `/reset-password`; username conocido, desconocido y solicitud repetida producen el mismo `202` y no exponen el email. Repeticiones quedan limitadas por Auth.
- Persistencia real: error SQL, desconexión previa al envío, respuesta perdida tras commit, lectura por el mismo UUID estable y dos updates serializados; no se repiten INSERT y la fila PostgreSQL coincide con la confirmación reconciliada.
- Catálogos: RLS en 12 tablas; vistas con `security_barrier=true`; grants de `anon` ausentes; cinco funciones `SECURITY DEFINER` inspeccionadas tienen `search_path` fijo y no ejecución pública; tabla nueva de sonda no recibe SELECT/INSERT por defecto.

La identidad sintética fija `__security_admin__` se conserva en Supabase local para respetar el guard de último admin. Las demás identidades y datos de prueba se eliminan en el hook final.

## Progreso real de OpenSpec

- **CHG-04: 3/3.** Auth/Mailpit prueba invitacion, verificacion, login, recovery/cambio de clave, logout, enlaces invalidos, expiracion, revocacion y ambos resultados de compensacion Auth/perfil. El fallo de perfil usa un CHECK real; el fallo de cleanup se inyecta en el limite de Auth Admin solo para test local. No hay atomicidad entre Auth y PostgreSQL. Cloud sigue apagado hasta verificar SMTP/redirect; excepciones sin correo individual pendientes.
- **CHG-05: 3/3.** Matriz documentada, grants/RLS locales auditados y matriz REST/RPC de identidades/filas/roles ejecutada. Ver [matriz de autorización](chg-05-authorization-matrix.md). El Change no se archiva hasta que los Changes dependientes y validación final estén completos.
- **CHG-01: 3/3 tras verificacion final.** Suite PostgreSQL/Auth 21/21 y navegador 6/6: SQL, RLS, desconexion, timeout reconciliado, timeout incierto con lectura vacia y respuesta antigua. Formularios, cache, toasts, cierre y no-reintento verificados en el formulario de clientes. Ver [evidencia CHG-01](chg-01-implementation-evidence.md).

## Activación segura

No hay migraciones Cloud, acceso general a tablas ni claves privilegiadas en el frontend. CHG-07 conserva la atomicidad de operaciones compuestas. No se archiva CHG-04 ni CHG-01 mientras quede algún criterio abierto.

- Auditoria final de vistas: las cinco conservan security_barrier=true, security_invoker=false, propietario postgres, SELECT solo para authenticated y sin grants de DML ni SELECT anonimo; filtrado comprobado con tokens por rol. No hizo falta modificar vistas. Ver matriz CHG-05.

## Evidencia adicional CHG-04

- Se crearon dos identidades sinteticas con el endpoint administrativo. El CHECK PostgreSQL rechazo el INSERT del perfil en ambos casos.
- Con compensacion disponible: HTTP 503 sin perfil de exito; consulta Auth confirma identidad eliminada y consulta de user_profiles confirma ausencia de perfil.
- Con error de transporte de compensacion: HTTP 503, identidad Auth conservada, incidencia privada abierta en provisioning_incidents y activacion denegada con 423. La resolucion por administrador verificado elimino Auth, cerro la incidencia y dejo cero perfiles huerfanos.
- El flujo normal de invitacion siguio pasando y requiere verificacion antes de activarse. No se crea una transaccion ficticia entre servicios.
