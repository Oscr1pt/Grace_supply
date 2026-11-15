# Spec Delta

## ADDED Requirements

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
