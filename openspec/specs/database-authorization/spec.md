# database-authorization Specification

## Purpose

Imponer mínimo privilegio en la base y sus operaciones de Grace Supply independientemente de la interfaz o del estado del navegador.

## Requirements

### Requirement: Denegación de acceso anónimo y revocado
El sistema SHALL denegar acceso privado por tablas, vistas y operaciones a clientes anónimos y cuentas revocadas, incluso si conservan tokens anteriores.

#### Scenario: Petición directa fuera de la interfaz
- **WHEN** un cliente anónimo o revocado intenta leer, insertar, actualizar, borrar o ejecutar una operación privada
- **THEN** no recibe datos privados ni realiza cambios y no puede eludirlo mediante vistas, relaciones embebidas o RPC.

### Requirement: Permisos vigentes por recurso y operación
La autorización SHALL evaluar identidad, estado activo y permiso vigente del módulo en cada operación, con denegación por defecto y reglas explícitas de filas y columnas.

#### Scenario: Empleado limitado a ventas
- **WHEN** un empleado con solo permiso sales accede a datos
- **THEN** puede consultar ventas y los datos mínimos de clientes, stock y recibo necesarios para vender, sin consultar costos de compra, contactos privados completos, usuarios ajenos ni gastos.

#### Scenario: Revocación de un permiso
- **WHEN** se retira un permiso y el empleado usa su sesión anterior
- **THEN** la siguiente operación protegida con ese permiso se deniega sin esperar renovación del token.

### Requirement: Privilegios de cuenta protegidos
Roles, permisos y estado de cuenta MUST estar protegidos contra autoedición y solo SHALL cambiar mediante administración autorizada; un administrador de aplicación no recibe privilegios de propietario de base.

#### Scenario: Cambio de identidad o rol en payload
- **WHEN** un empleado envía otro ID de usuario o rol admin en una petición
- **THEN** no cambia su autoridad ni puede modificar privilegios de ninguna cuenta.

### Requirement: Protección de mutaciones financieras
El sistema MUST bloquear DELETE financiero y mutaciones directas que eludan las operaciones autorizadas de contabilización; si una operación segura aún no existe, el flujo MUST permanecer cerrado.

#### Scenario: Intento de modificar saldo directamente
- **WHEN** un empleado o administrador de aplicación intenta alterar saldo, stock por una venta o un pago sin la operación autorizada
- **THEN** se rechaza la mutación directa; no se concede acceso temporal irrestricto para mantener el cliente heredado.

### Requirement: Ejecución mínima de funciones
Toda función expuesta SHALL tener ejecución limitada, validación propia de identidad y permiso y salida acotada, sin aceptar actor del cliente ni permitir eludir restricciones de objetos subyacentes.

#### Scenario: RPC privilegiada invocada con token insuficiente
- **WHEN** un empleado sin permiso llama una función privilegiada con IDs arbitrarios
- **THEN** la función deniega antes de leer o mutar datos y no filtra información por su respuesta.

### Requirement: Cobertura de todos los caminos de acceso
La autorización MUST cubrir los objetos actuales y futuros y MUST NOT usar políticas globales irrestrictas; su validación SHALL incluir privilegios y acceso efectivo, no solo el indicador de RLS habilitado.

#### Scenario: Tabla o función nueva
- **WHEN** una migración introduce un recurso financiero, relacional o auditable
- **THEN** permanece cerrado hasta recibir reglas y pruebas explícitas de acceso por cada rol.

### Requirement: Corte de seguridad coordinado
CHG-05 MUST activarse con CHG-04 en una ventana conjunta y MUST mantener denegaciones durante la recuperación.

#### Scenario: Falla una prueba de la matriz
- **WHEN** cualquier rol obtiene datos o cambios no autorizados durante el ensayo o corte
- **THEN** no se reabre tráfico y se recupera una configuración segura conjunta sin volver a políticas permisivas.

### Requirement: Matriz de permisos vigente
La autorización MUST usar una matriz explícita por módulo, operación y rol en PostgreSQL y mecanismos de servidor confiables. Los permisos MUST reflejar el estado activo actual de la identidad.

#### Scenario: Módulo sin concesión explícita
- **WHEN** un empleado accede a un módulo u operación sin permiso asignado
- **THEN** se deniega por defecto en la base sin inferir permiso de una ruta visible.

### Requirement: Operaciones de empleado acotadas
Los empleados activos SHALL registrar ventas y consultar el inventario necesario. La gestión de clientes SHALL requerir el permiso explícito correspondiente.

#### Scenario: Empleado sin permiso de clientes
- **WHEN** un empleado con permiso de ventas intenta modificar clientes
- **THEN** la base deniega la modificación.

### Requirement: Operaciones administrativas reservadas
Compras, gastos, administración de cuentas, modificación de precios y anulaciones MUST quedar denegadas a empleados por defecto y reservadas a administradores activos.

#### Scenario: Empleado intenta operación administrativa
- **WHEN** un empleado intenta comprar, registrar gastos, administrar cuentas, cambiar precios o anular un documento por REST/RPC
- **THEN** PostgreSQL deniega la operación aunque la interfaz la permita o el payload declare otro rol.
