# CHG-05 — Matriz de autorización local

Alcance observado en PostgreSQL local el 2026-10-22. La aplicación modela una sola empresa: un permiso de módulo cubre las filas de negocio de ese módulo. `anon` y perfiles inactivos no acceden a información privada. La UI no concede autoridad.

## Tablas y operaciones

`R` = SELECT; `C` = INSERT; `U` = UPDATE; `D` = DELETE. “Módulo” requiere perfil activo, correo Auth confirmado y permiso indicado. `Admin` también requiere perfil activo y confirmado. Una celda “denegado” es una decisión deliberada mientras CHG-07 no proporcione RPC transaccionales.

| Objeto | anon / revocado | Empleado autorizado | Admin activo | Campos/alcance sensible |
| --- | --- | --- | --- | --- |
| `clients` | R/C/U/D denegado | `clients`: CRUD | CRUD | `sales` solo recibe proyección `id,name,status`; el join de contacto queda vacío |
| `suppliers` | R/C/U/D denegado | `suppliers`: CRUD | CRUD | `purchases` solo recibe proyección `id,name,status`; join de contacto vacío |
| `inventory` | R/C/U/D denegado | `inventory`: R/C/U de metadatos; D denegado | R/C/U de catálogo/precios; D denegado | `cost_price` no sale en lookups; `quantity` solo cambia mediante operación transaccional |
| `sales` | R/C/U/D denegado | `sales` o `clients`: R | R | C/U/D directos denegados incluso al admin hasta CHG-07/08 |
| `sale_lines` | R/C/U/D denegado | `sales` o `clients`: R | R | C/U/D directos denegados |
| `purchases` | R/C/U/D denegado | `purchases` o `suppliers`: R | R | C/U/D directos denegados |
| `client_credits` | R/C/U/D denegado | `clients`: R | R | mutaciones solo por RPC futuro |
| `supplier_credits` | R/C/U/D denegado | `suppliers` o `purchases`: R | R | mutaciones solo por RPC futuro |
| `credit_payments` | R/C/U/D denegado | `clients`: pagos de crédito cliente; `suppliers`/`purchases`: pagos de proveedor | R | la política filtra por FK y tipo de crédito; DML directo denegado |
| `expenses` | R/C/U/D denegado | `expenses`: R/C/U; D denegado | R/C/U; D denegado | `registered_by` viene de `auth.uid()`/perfil; no se permite alterar autor, estado ni `created_at` |
| `settings` | R/C/U/D denegado | `settings`: R; `sales`: solo vista de recibo | R/U | singleton; C/D denegado; ventas recibe negocio, moneda e impuesto mínimos |
| `user_profiles` | R/C/U/D denegado | R solo de su propio perfil; C/U/D denegado | R de directorio mínimo; C/U/D directo denegado | Auth email, contraseña, UUID ajeno y metadatos privados no se exponen; administración pasa por Edge Function |

## Vistas, joins y funciones

| Objeto | Acceso comprobado | Restricción comprobada |
| --- | --- | --- |
| `sales_client_lookup` | SELECT solo permiso `sales` | solo `id,name,status` |
| `sales_inventory_lookup` | SELECT con `sales` o `purchases` | solo `id,sku,name,price,quantity`; sin coste |
| `sales_receipt_settings` | SELECT solo permiso `sales` | campos necesarios para recibo |
| `purchases_supplier_lookup` | SELECT solo permiso `purchases` | solo `id,name,status` |
| `admin_inventory_catalog` | SELECT solo admin activo | catálogo, precios/costes; empleado recibe cero filas |
| joins `sales → clients`, `purchases → suppliers` | padre visible al módulo correspondiente | RLS del objeto relacionado oculta correo y contacto; prueba directa no devuelve la relación |
| `private.has_permission`, `private.is_active_admin`, `private.current_profile_username` | helpers internos de RLS, no RPC expuesto por PostgREST | sin ejecución para `anon`; schema `private` no está en `api.schemas` |
| `private.guard_inventory_protected_fields`, `public.guard_last_active_admin`, `public.require_confirmed_auth_identity` | triggers | sin EXECUTE para `anon`/`authenticated`; rutas `search_path` fijas |
| `username-login` | POST público | respuesta genérica; Auth valida contraseña; no entrega correo |
| `username-recovery` | POST público solo con gate servidor habilitado | respuesta genérica; correo individual verificado y enlace oficial Auth; el correo nunca forma parte de la respuesta |
| `manage-profile` | admin activo confirmado | update/revoke/invite/activate confiable; invitación de empleado únicamente y gated; sin `service_role` en frontend |

Las cinco vistas tienen `security_barrier=true` y SELECT únicamente. Se ejecutan como propietario para exponer columnas reducidas pese a que RLS de las tablas base deniega ese permiso cruzado; cada vista filtra con helpers `SECURITY DEFINER` que derivan `auth.uid()` y estado/permisos de `user_profiles`. Se comprobaron las vistas con JWT de empleado y admin, incluyendo joins y acceso directo. Cambiar a `security_invoker` sin rediseñar esas proyecciones quitaría las lecturas mínimas de ventas/compras; cualquier cambio debe conservar las pruebas de filtrado.

## Evidencia local

- `tests/security.integration.test.mjs`: 21/21 escenarios pasan con Auth real, fixtures sintéticos, REST/PostgREST y PostgreSQL local.
- Se recorren SELECT anónimo en las 12 tablas y 5 vistas; los writes no autorizados de tablas financieras, vistas, ajustes y perfiles se rechazan.
- CRUD permitido probado para clientes, proveedores, metadatos de inventario y gastos; se prueban denegaciones de borrado, precio/stock, autor de gasto y permisos cruzados.
- Se prueban rol escalado por DML, endpoint de gestión invocado por empleado, perfil cruzado, join de datos de contacto, vista de coste solo admin, token revocado vigente, JWT expirado/forjado, registro público apagado y RPC privado no expuesto.
- Catálogo PostgreSQL: RLS activo en las 12 tablas; `anon` no tiene SELECT en tablas/vistas ni EXECUTE en funciones de seguridad; los cinco helpers/guards `SECURITY DEFINER` revisados declaran `search_path`; grants por columna y políticas son explícitos. Una sonda transaccional creó y eliminó una tabla en `public` y confirmó que los grants por defecto de SELECT/INSERT son `false` para `anon` y `authenticated`.
- La migración `20261022202000_chg05_stable_ids_for_authorized_inserts.sql` permite INSERT de `id` estable solo en `clients`, `suppliers`, `inventory` y `expenses`; no permite UPDATE de ID. RLS sigue limitando quién inserta.

Esta matriz describe permisos observados en la base local. No autoriza ni afirma despliegue en Supabase Cloud. Los RPC de operaciones financieras siguen pendientes de CHG-07.

## Auditoria final de las cinco vistas en PostgreSQL local (2026-10-22)

| Vista | Propietario | security_barrier | security_invoker | SELECT anon | SELECT authenticated | INSERT/UPDATE/DELETE |
|---|---|---:|---:|---:|---:|---|
| `admin_inventory_catalog` | postgres | true | false | denegado | permitido | denegado a ambos roles |
| `purchases_supplier_lookup` | postgres | true | false | denegado | permitido | denegado a ambos roles |
| `sales_client_lookup` | postgres | true | false | denegado | permitido | denegado a ambos roles |
| `sales_inventory_lookup` | postgres | true | false | denegado | permitido | denegado a ambos roles |
| `sales_receipt_settings` | postgres | true | false | denegado | permitido | denegado a ambos roles |

`security_invoker=false` significa que las vistas usan privilegios del propietario `postgres`; por ello no se afirma que el RLS base opere como si la vista usara el JWT invocador. Las cinco definiciones incorporan filtros por `auth.uid()` mediante `private.has_permission` o `private.is_active_admin`. La aplicacion efectiva se verifico con tokens Auth reales de empleados por modulo, admin, anon y revocado, comprobando filas visibles y joins mediante los 21 escenarios existentes. `security_barrier=true` se mantiene para evitar filtraciones por reordenamiento de predicados. No se cambio ninguna vista: el audit no encontro un defecto y convertirlas a `security_invoker` sin conceder privilegios base adicionales romperia las proyecciones minimas.

Consulta de catalogo usada: `pg_class.relowner`, `pg_options_to_table(reloptions)` y `has_table_privilege` para SELECT/INSERT/UPDATE/DELETE de `anon` y `authenticated`. Resultado: ninguna vista concede DML; no hay acceso anonimo de lectura.