# safe-sales-purchases-ui Specification

## Purpose
Ventas, compras y documentos sin ambigüedad. Asegurar experiencia confiable conservando las invariantes existentes de autenticación, RLS y operaciones financieras.

## Requirements

### Requirement: Reglas de negocio visibles antes de contabilizar
La UI SHALL comunicar restricciones conocidas de venta y disponibilidad, conservando la autorización final de PostgreSQL.

#### Scenario: La política tributaria está sin aprobar
- **WHEN** la política tributaria está sin aprobar
- **THEN** el usuario conoce el bloqueo antes del intento y ninguna acción UI permite contabilizar la venta.

### Requirement: Documento y recibo consistentes
La selección y visualización MUST respetar UUID, snapshots de líneas, importes y stock confirmado sin reescribir documentos históricos.

#### Scenario: Cambia el precio de un artículo tras emitir un recibo
- **WHEN** cambia el precio de un artículo tras emitir un recibo
- **THEN** el recibo previo conserva sus líneas e importes confirmados.

### Requirement: Reconciliación y anulación confiables
Los botones SHALL impedir duplicación accidental y requerir motivo para anular por operaciones idempotentes.

#### Scenario: Se pierde respuesta de una compra enviada
- **WHEN** se pierde respuesta de una compra enviada
- **THEN** el formulario conserva clave e información, permite consultar resultado y no vuelve a contabilizar a ciegas.

### Requirement: Historiales de ventas y compras con búsqueda y períodos
Las pantallas de historial SHALL buscar por los identificadores y nombres de contraparte disponibles y filtrar por período sin cambiar las operaciones financieras ni ampliar los datos visibles por los permisos existentes.

#### Scenario: El usuario busca ventas por recibo o cliente
- **WHEN** el usuario introduce texto de búsqueda en Ventas
- **THEN** el historial incluye ventas cuyo número de recibo o nombre visible del cliente relacionado coincide, respetando los permisos de lectura vigentes.

#### Scenario: El usuario busca compras por identificador o proveedor
- **WHEN** el usuario introduce texto de búsqueda en Compras
- **THEN** el historial incluye compras cuyo número de factura, UUID o nombre histórico del proveedor coincide, sin depender del nombre actual del proveedor.

#### Scenario: El usuario filtra por períodos predefinidos o personalizados
- **WHEN** el usuario selecciona Todos, Hoy, Últimos 7 días, Este mes o un rango personalizado
- **THEN** se muestran registros por `created_at` dentro del período civil de `America/Santo_Domingo`; el rango incluye el día final completo mediante un límite superior exclusivo.

#### Scenario: El usuario limpia o cambia un filtro
- **WHEN** el usuario cambia un filtro o activa Limpiar filtros
- **THEN** la búsqueda y el período visibles corresponden a los resultados y la navegación vuelve a la primera página.

### Requirement: Historiales con paginación acotada y orden estable
Las páginas de historial SHALL consultar los registros en el servidor en bloques de 25, ordenar por fecha descendente y después identificador único descendente, y mostrar el total de coincidencias filtradas con navegación Anterior y Siguiente.

#### Scenario: Hay más de una página de resultados
- **WHEN** la búsqueda y los filtros producen más de 25 registros
- **THEN** cada página muestra el bloque correcto, conserva el orden estable y permite recorrer todos los resultados sin duplicados ni omisiones.

#### Scenario: Se consulta una página vacía por un cambio concurrente
- **WHEN** cambios concurrentes dejan fuera de rango una página solicitada
- **THEN** la interfaz actualiza el total y vuelve a una página válida sin presentar el conjunto como un historial vacío.

#### Scenario: Un usuario carece del permiso de lectura
- **WHEN** un usuario sin permiso invoca directamente la consulta RPC
- **THEN** la llamada es rechazada y no revela registros ni un conteo del historial protegido.

### Requirement: Estados del historial distinguen consulta, error y ausencia de coincidencias
Las pantallas de Ventas y Compras SHALL identificar la carga, el error recuperable, un historial sin registros y una búsqueda o período sin coincidencias, manteniendo los controles utilizables en pantallas estrechas.

#### Scenario: La consulta falla
- **WHEN** Supabase rechaza o no completa una consulta del historial
- **THEN** la interfaz muestra un error con reintento y no lo presenta como cero resultados confirmado.

#### Scenario: No hay coincidencias para los filtros activos
- **WHEN** la consulta se completa correctamente y no encuentra registros para los filtros actuales
- **THEN** la interfaz explica que no hay coincidencias y ofrece limpiar los filtros.

#### Scenario: Los controles se usan en anchos móviles y de escritorio
- **WHEN** el historial se presenta a 320, 375, 768 o 1280 píxeles
- **THEN** búsqueda, período, rango, limpieza y navegación siguen alcanzables sin desbordamiento horizontal involuntario.

### Requirement: El formulario distingue cliente registrado y ocasional
La interfaz SHALL permitir elegir un cliente activo por identidad o capturar solo un nombre ocasional, mostrando con claridad qué opción conserva una identidad y cuáles medios de pago están permitidos.

#### Scenario: Se selecciona un cliente registrado
- **WHEN** el operador selecciona un cliente activo
- **THEN** la venta conserva el UUID y permite contado o crédito bajo las reglas existentes.

#### Scenario: Se captura un cliente ocasional
- **WHEN** el operador cambia a cliente ocasional
- **THEN** puede escribir un nombre sin completar documento, teléfono, correo ni otros datos, y el crédito queda indisponible.

#### Scenario: Se muestra el documento de cliente ocasional
- **WHEN** una venta ocasional aparece en historial o recibo
- **THEN** se muestra el nombre guardado en esa venta sin buscar ni sustituirlo por otro cliente de nombre coincidente.

### Requirement: Acceso rápido a registrar venta respeta los controles vigentes
El Dashboard SHALL ofrecer «Registrar venta» únicamente a usuarios con permiso `sales` y su acceso directo SHALL conservar autenticación, autorización de servidor y bloqueo tributario.

#### Scenario: Usuario con permiso de ventas
- **WHEN** un usuario con permiso `sales` abre Acciones rápidas y elige «Registrar venta»
- **THEN** llega al formulario de Nueva venta directamente o mediante la ruta de Ventas, sin omitir la validación de sesión ni el permiso de PostgreSQL.

#### Scenario: Usuario sin permiso de ventas
- **WHEN** un usuario sin permiso `sales` consulta el Dashboard
- **THEN** la acción no se presenta y una navegación directa no permite contabilizar una venta.

#### Scenario: Política tributaria bloquea la venta
- **WHEN** el usuario activa el acceso rápido mientras la política de ventas no está aprobada
- **THEN** se presenta el bloqueo tributario existente y no se abre un flujo que permita eludirlo.
