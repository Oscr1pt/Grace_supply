# Spec Delta

## ADDED Requirements

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